import { auth } from '@/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isAuth = !!req.auth
  const publicPaths = ['/login', '/register', '/api/auth', '/api/ai', '/_next', '/favicon.ico']
  const isPublic = publicPaths.some((p) => pathname.startsWith(p))
  if (!isAuth && !isPublic) {
    const loginUrl = new URL('/login', req.nextUrl.origin)
    return NextResponse.redirect(loginUrl)
  }
  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
