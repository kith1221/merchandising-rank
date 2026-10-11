import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function POST(request: Request) {
  try {
    const { name, email, password } = await request.json()
    if (!email || !password || password.length < 6) {
      return NextResponse.json({ error: 'Data tidak valid (password minimal 6 karakter)' }, { status: 400 })
    }
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'Email sudah terdaftar' }, { status: 400 })
    }
    const hashed = await bcrypt.hash(password, 10)
    await prisma.user.create({ data: { name: name || email, email, password: hashed } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Registrasi gagal' }, { status: 500 })
  }
}
