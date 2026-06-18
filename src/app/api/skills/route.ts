import { NextResponse } from 'next/server'
import { loadSkills } from '@/server/skill-loader'

export async function GET() {
  const skills = loadSkills()
  return NextResponse.json({ skills })
}