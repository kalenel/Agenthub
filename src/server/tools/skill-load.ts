import { z } from 'zod'

import { getSkillsByNames, loadSkills } from '@/server/skill-loader'

import type { ToolDef } from './types'

const ArgsSchema = z.object({
  name: z.string().min(1).describe('Skill name to load'),
})

export const skillLoadTool: ToolDef = {
  name: 'skill_load',
  description:
    'Load a skill by name to get its full instructions. Use this when you need domain-specific guidance (e.g., frontend design patterns, testing workflows, deployment strategies). Call this BEFORE starting the actual work so the skill instructions are available. Skills are loaded once per conversation turn.',
  parameters: {
    type: 'object',
    required: ['name'],
    properties: {
      name: {
        type: 'string',
        description: 'The exact skill name to load. Check the Skill Registry in your system prompt for available skills.',
      },
    },
  },
  async handler(args) {
    const parsed = ArgsSchema.safeParse(args)
    if (!parsed.success) {
      return { ok: false, error: `Invalid args: ${parsed.error.message}` }
    }

    const skills = getSkillsByNames([parsed.data.name])
    if (skills.length === 0) {
      const all = loadSkills()
      const names = all.map(s => s.name).join(', ')
      return { ok: false, error: `Skill "${parsed.data.name}" not found. Available: ${names.substring(0, 500)}` }
    }

    const skill = skills[0]
    return {
      ok: true,
      value: `## Skill: ${skill.name}\n${skill.body}\n\n---\nSkill "${skill.name}" loaded. Follow the instructions above.`,
    }
  },
}


const STOP_WORDS_EN = new Set(['the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','shall','should','may','might','must','can','could','i','me','my','we','our','you','your','he','she','it','they','them','this','that','these','those','to','of','in','for','on','with','at','by','from','as','into','through','during','before','after','above','below','between','out','off','over','under','again','further','then','once','here','there','when','where','why','how','all','both','each','few','more','most','other','some','such','no','nor','not','only','own','same','so','than','too','very','just','because','but','and','or','if','while','about','up','down','use','using','used','when','user','asks','build','create','work','need','want','like','make','get','set','put','take','see','know','also','now','new','any','one','two','many','well','back','still','way','even','much','really','around','things','something','everything','anything','nothing','people','time','good','great','big','small','different','important','every','often','usually','always','never','sometimes','might','could','would','should','without','within','along','across'])

const STOP_WORDS_ZH = new Set(['的','了','是','在','我','有','和','就','不','人','都','一','一个','上','也','很','到','说','要','去','你','会','着','没有','看','好','自己','这','他','她','它','们','那','什么','怎么','哪','为什么','因为','所以','如果','虽然','但是','可以','需要','应该','能够','可能','已经','还','又','再','才','刚','正在','一直','总是','经常','从','被','把','对','向','与','跟','为','让','叫','给','用','通过','按照','根据','关于','对于','除了','包括'])

/** Tokenize text for matching — handles Chinese + English */
function tokenize(text: string): string[] {
  // Extract Chinese characters as individual tokens (bigrams for better matching)
  const zhChars = text.match(/[\u4e00-\u9fff]+/g) || []
  const zhBigrams: string[] = []
  for (const seg of zhChars) {
    for (let i = 0; i < seg.length - 1; i++) {
      zhBigrams.push(seg.substring(i, i + 2))
    }
    // Also include unigrams for single-character matches
    for (const ch of seg) {
      if (!STOP_WORDS_ZH.has(ch)) zhBigrams.push(ch)
    }
  }
  
  // Extract English words
  const enWords = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS_EN.has(t))
  
  return [...zhBigrams, ...enWords]
}

/** Codex-style semantic skill matching — scores by description relevance */
export function matchSkills(prompt: string, agentSkillNames?: string[], topN = 5): string[] {
  const all = loadSkills()
  const pool = agentSkillNames && agentSkillNames.length > 0
    ? all.filter(s => agentSkillNames.includes(s.name))
    : all

  if (pool.length === 0) return []

  const promptTokens = tokenize(prompt)
  if (promptTokens.length === 0) return []

  // Build TF map for prompt tokens
  const promptTF = new Map<string, number>()
  for (const t of promptTokens) {
    promptTF.set(t, (promptTF.get(t) || 0) + 1)
  }

  // Score each skill
  const scored = pool.map(skill => {
    const nameTokens = tokenize(skill.name)
    const descTokens = tokenize(skill.description)
    
    // Name match: exact name tokens are very strong signal
    let nameScore = 0
    for (const t of nameTokens) {
      if (promptTF.has(t)) nameScore += 3 * (promptTF.get(t) || 1)
    }
    
    // Description match: weighted by TF
    let descScore = 0
    const descTF = new Map<string, number>()
    for (const t of descTokens) {
      descTF.set(t, (descTF.get(t) || 0) + 1)
    }
    for (const [t, freq] of promptTF) {
      if (descTF.has(t)) {
        // IDF-like: rarer terms in description are more discriminative
        const idf = Math.log(1 + descTokens.length / (descTF.get(t) || 1))
        descScore += freq * idf
      }
    }
    
    const score = nameScore + descScore * 0.5
    return { name: skill.name, score }
  })

  // Sort by score descending, filter by threshold
  const MIN_SCORE = 2
  return scored
    .filter(s => s.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(s => s.name)
}

export function getSkillInjectionBlock(skillNames: string[]): string {
  if (skillNames.length === 0) return ''
  const skills = getSkillsByNames(skillNames)
  if (skills.length === 0) return ''
  return '\n\n' + skills.map(s => `## Skill: ${s.name}\n${s.body}`).join('\n\n---\n\n')
}
/** Generate the skill registry text for system prompt injection */
export function buildSkillRegistry(agentSkillNames?: string[]): string {
  const all = loadSkills()
  const skills = agentSkillNames && agentSkillNames.length > 0
    ? all.filter(s => agentSkillNames.includes(s.name))
    : all

  if (skills.length === 0) return ''

  const lines = skills.map(s =>
    `- **${s.name}**: ${s.description}`
  )

  return `## Skill Registry\nYou have access to the following skills. Call \`skill_load\` with a skill name to load its full instructions before starting related work.\n\n${lines.join('\n')}\n\nLoad skills sparingly — only when the task clearly matches a skill's domain.`
}