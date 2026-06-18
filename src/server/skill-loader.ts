import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

export interface SkillDef {
  name: string
  description: string
  source: string
  body: string
}

const SKILL_ROOTS = [
  'C:\\Users\\xiong\\.codex\\skills',
  'C:\\Users\\xiong\\.agents\\skills',
]

let _cache: SkillDef[] | null = null

function parseSkill(filePath: string): SkillDef | null {
  try {
    const raw = readFileSync(filePath, 'utf8')
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
    if (!match) return null

    const fm = match[1]
    const body = match[2].trim()

    const nameMatch = fm.match(/^name:\s*(.+)$/m)
    if (!nameMatch) return null

    let description = ''
    const descLine = fm.match(/^description:\s*(.+)$/m)
    if (descLine) {
      const val = descLine[1].trim()
      if (val === '|') {
        const multi = fm.match(/^description:\s*\|\r?\n((?:\s{2}.+\r?\n)+)/m)
        if (multi) {
          description = multi[1].replace(/^\s{2}/gm, '').replace(/\r?\n/g, ' ').trim()
        }
      } else {
        description = val.replace(/^"|"$/g, '')
      }
    }

    return {
      name: nameMatch[1].trim().replace(/^"|"$/g, ''),
      description: description.substring(0, 300),
      source: '',
      body: body.substring(0, 8000),
    }
  } catch {
    return null
  }
}

function scanDir(dir: string, skills: SkillDef[], prefix: string) {
  if (!existsSync(dir)) return
  const entries = readdirSync(dir)
  for (const name of entries) {
    const full = join(dir, name)
    if (!statSync(full).isDirectory()) continue
    const skillFile = join(full, 'SKILL.md')
    if (existsSync(skillFile)) {
      const skill = parseSkill(skillFile)
      if (skill) {
        skill.source = prefix ? prefix + '/' + name : name
        skills.push(skill)
      }
    }
    scanDir(full, skills, prefix ? prefix + '/' + name : name)
  }
}

export function loadSkills(): SkillDef[] {
  if (_cache) return _cache
  const skills: SkillDef[] = []
  for (const root of SKILL_ROOTS) {
    scanDir(root, skills, '')
  }
  _cache = skills
  return skills
}

export function getSkillsByNames(names: string[]): SkillDef[] {
  const all = loadSkills()
  if (names.length === 0) return []
  const set = new Set(names)
  return all.filter(s => set.has(s.name))
}

export function clearSkillCache() {
  _cache = null
}
