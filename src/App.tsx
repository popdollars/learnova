import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  GraduationCap, LayoutDashboard, BookOpen, CalendarDays,
  BrainCircuit, Bookmark, Search, Bell,
  ArrowUpRight, Clock3, Sparkles, Play, MoreHorizontal,
  Flame, Target, CheckCircle2, Menu, X,
  MessageCircle, TrendingUp, Send, Headphones, Layers,
  LogOut, LockKeyhole, Mail, User, LoaderCircle
} from 'lucide-react'
import './App.css'
import './Auth.css'

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:4000`

type AuthUser = {
  id: string
  email: string
  display_name?: string
  role?: string
  avatar_url?: string | null
}

type AuthResponse = {
  success?: boolean
  message?: string
  requiresEmailConfirmation?: boolean
  code?: string
  session?: {
    access_token?: string
    refresh_token?: string
    session_id?: string
  }
  access_token?: string
  session_id?: string
  security?: {
    warning_required?: boolean
    switches_last_24_hours?: number
  }
}

const courses = [
  { id: 1, name: 'Business Statistics', code: 'BBA 204', progress: 78, color: 'purple', lessons: '12 of 16 lessons', icon: '📊' },
  { id: 2, name: 'Principles of Management', code: 'BBA 201', progress: 62, color: 'blue', lessons: '8 of 13 lessons', icon: '📚' },
  { id: 3, name: 'Research Methods', code: 'BBA 305', progress: 45, color: 'orange', lessons: '5 of 11 lessons', icon: '🔬' },
]

const navigation = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'My courses', icon: BookOpen },
  { label: 'Study planner', icon: CalendarDays },
  { label: 'AI tutor', icon: BrainCircuit },
  { label: 'Saved materials', icon: Bookmark },
]

function getDeviceLabel() {
  const ua = navigator.userAgent
  if (/Android/i.test(ua)) return 'Android device'
  if (/iPhone|iPad/i.test(ua)) return 'Apple mobile device'
  if (/Windows/i.test(ua)) return 'Windows computer'
  if (/Mac/i.test(ua)) return 'Mac computer'
  return 'Web browser'
}

function App() {
  const [accessToken, setAccessToken] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [user, setUser] = useState<AuthUser | null>({ id: 'local-student', email: 'student@learnova.local', display_name: 'Student', role: 'Student' })
  const [authLoading, setAuthLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [registerName, setRegisterName] = useState('')
  const [registerPhone, setRegisterPhone] = useState('')
  const [verificationChannel, setVerificationChannel] = useState<'email' | 'sms'>('email')
  const [authError, setAuthError] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [verificationPending, setVerificationPending] = useState(false)
  const [verificationCode, setVerificationCode] = useState('')
  const [securityWarning, setSecurityWarning] = useState('')

  const [activePage, setActivePage] = useState('Overview')
  const [search, setSearch] = useState('')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<string[]>([])

  const filteredCourses = useMemo(
    () => courses.filter(course =>
      `${course.name} ${course.code}`.toLowerCase().includes(search.toLowerCase())
    ),
    [search]
  )

  async function apiRequest(path: string, options: RequestInit = {}, token?: string, currentSession?: string) {
    const headers = new Headers(options.headers)
    headers.set('Content-Type', 'application/json')

    if (token) headers.set('Authorization', `Bearer ${token}`)
    if (currentSession) headers.set('x-learnova-session', currentSession)

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    })

    const result = await response.json().catch(() => ({}))

    if (!response.ok || result.success === false) {
      throw new Error(result.message || 'The request could not be completed.')
    }

    return result
  }

  function saveSession(token: string, id: string) {
    sessionStorage.setItem('learnova_access_token', token)
    sessionStorage.setItem('learnova_session_id', id)
    setAccessToken(token)
    setSessionId(id)
  }

  function clearSession() {
    sessionStorage.removeItem('learnova_access_token')
    sessionStorage.removeItem('learnova_session_id')
    setAccessToken('')
    setSessionId('')
    setUser(null)
  }

  async function loadProfile(token: string, id: string) {
    const result = await apiRequest('/api/auth/me', {}, token, id)
    const profile = result.profile

    setUser({
      id: result.user.id,
      email: result.user.email || '',
      display_name: profile?.display_name || '',
      role: profile?.role || 'student',
      avatar_url: profile?.avatar_url || null,
    })
  }

  useEffect(() => {
    let cancelled = false

    async function restoreSession() {
      const token = sessionStorage.getItem('learnova_access_token')
      const id = sessionStorage.getItem('learnova_session_id')

      if (!token || !id) {
        setAuthLoading(false)
        return
      }

      try {
        const result = await apiRequest('/api/auth/me', {}, token, id)
        if (cancelled) return

        setAccessToken(token)
        setSessionId(id)
        setUser({
          id: result.user.id,
          email: result.user.email || '',
          display_name: result.profile?.display_name || '',
          role: result.profile?.role || 'student',
          avatar_url: result.profile?.avatar_url || null,
        })
      } catch {
        if (!cancelled) {
          clearSession()
          setAuthNotice('Your session has expired or was replaced. Please sign in again.')
        }
      } finally {
        if (!cancelled) setAuthLoading(false)
      }
    }

    restoreSession()
    return () => { cancelled = true }
  }, [])

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthError('')
    setAuthNotice('')
    setSecurityWarning('')

    if (!email.trim() || !password) {
      setAuthError('Please enter your email address and password.')
      return
    }

    if (authMode === 'register' && !registerName.trim()) {
      setAuthError('Please enter your name.')
      return
    }

    setSubmitting(true)

    try {
      const endpoint = authMode === 'login'
        ? '/api/auth/login'
        : '/api/auth/register'

      const body = authMode === 'login'
        ? { email: email.trim(), password, deviceLabel: getDeviceLabel() }
        : {
            email: email.trim(),
            password,
            displayName: registerName.trim(),
            phoneNumber: registerPhone.trim(),
            verificationChannel,
            redirectTo: window.location.origin,
            deviceLabel: getDeviceLabel(),
          }

      const result: AuthResponse = await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      })

      const token = result.session?.access_token || result.access_token
      const id = result.session_id || result.session?.session_id

      if (!token || !id) {
        if (authMode === 'register' && result.requiresEmailConfirmation) {
          setVerificationPending(true)
          setVerificationCode('')
          setAuthNotice(`A six-digit verification code has been sent to ${email.trim()}.`)
          setPassword('')
          return
        }

        setAuthNotice(result.message || 'Registration received.')
        setAuthMode('login')
        setPassword('')
        return
      }

      saveSession(token, id)

      if (result.security?.warning_required) {
        setSecurityWarning(
          `Security notice: ${result.security.switches_last_24_hours ?? 3} device switches were recorded in the last 24 hours. If these were not yours, secure your account.`
        )
      }

      await loadProfile(token, id)
      setPassword('')
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Authentication failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleVerifyEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthError('')
    setSubmitting(true)

    try {
      const result: AuthResponse = await apiRequest('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          token: verificationCode.trim(),
          deviceLabel: getDeviceLabel(),
        }),
      })

      const token = result.session?.access_token || result.access_token
      const id = result.session_id || result.session?.session_id

      if (!token || !id) {
        throw new Error(result.message || 'Verification did not return a valid session.')
      }

      saveSession(token, id)
      setVerificationPending(false)
      setVerificationCode('')

      if (result.security?.warning_required) {
        setSecurityWarning(
          `Security notice: ${result.security.switches_last_24_hours ?? 3} device switches were recorded in the last 24 hours.`
        )
      }

      await loadProfile(token, id)
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Email verification failed.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResendVerification() {
    setAuthError('')
    setAuthNotice('')
    setSubmitting(true)

    try {
      const result: AuthResponse = await apiRequest('/api/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      })
      setAuthNotice(result.message || 'Request completed. Check your email.')
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Could not resend the code.')
    } finally {
      setSubmitting(false)
    }
  }
  async function handleLogout() {
    try {
      if (accessToken && sessionId) {
        await apiRequest('/api/auth/logout', {
          method: 'POST',
        }, accessToken, sessionId)
      }
    } catch (error) {
      console.error('Logout request:', error)
    } finally {
      clearSession()
      setAuthNotice('You have been signed out.')
      setActivePage('Overview')
    }
  }

  function askTutor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!question.trim()) return
    setMessages(previous => [...previous, question.trim()])
    setQuestion('')
  }

  function navigate(page: string) {
    setActivePage(page)
    setMobileMenu(false)
  }

  if (authLoading) {
    return (
      <div className="auth-loading">
        <LoaderCircle className="auth-spinner" size={34} />
        <strong>Preparing your Learnova workspace...</strong>
        <span>Checking your active session</span>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="brand-icon"><GraduationCap size={27} /></div>
            <div>
              <strong>Learnova</strong>
              <span>LEARN · GROW · EXCEL</span>
            </div>
          </div>

          <div className="auth-heading">
            <span className="auth-eyebrow"><Sparkles size={14} /> YOUR LEARNING SPACE</span>
            <h1>{verificationPending ? 'Verify your email.' : authMode === 'login' ? 'Welcome back.' : 'Create your account.'}</h1>
            <p>
              {authMode === 'login'
                ? 'Sign in to continue your learning journey.'
                : 'Join Learnova and start building your future.'}
            </p>
          </div>

          {authNotice && <div className="auth-notice">{authNotice}</div>}
          {authError && <div className="auth-error">{authError}</div>}

          {verificationPending ? (
            <form className="auth-form" onSubmit={handleVerifyEmail}>
              <label>
                <span>Six-digit verification code</span>
                <div className="auth-input-wrap">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={verificationCode}
                    onChange={event => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter your 6-digit code"
                    maxLength={6}
                    pattern="[0-9]{6}"
                    required
                  />
                </div>
              </label>
              <button className="auth-submit" type="submit" disabled={submitting || verificationCode.length !== 6}>
                {submitting ? 'Verifying...' : 'Verify email'}
              </button>
              <button className="auth-submit" type="button" disabled={submitting} onClick={handleResendVerification}>
                Resend verification code
              </button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={handleAuth}>
            {authMode === 'register' && (
              <label>
                <span>Your name</span>
                <div className="auth-input-wrap">
                  <User size={17} />
                  <input
                    value={registerName}
                    onChange={event => setRegisterName(event.target.value)}
                    placeholder="Enter your full name"
                    autoComplete="name"
                    required
                  />
                </div>
              </label>
            )}

            {authMode === 'register' && (
              <>
                <label>
                  <span>Phone number</span>
                  <div className="auth-input-wrap">
                    <input
                      type="tel"
                      value={registerPhone}
                      onChange={event => setRegisterPhone(event.target.value)}
                      placeholder="+2507XXXXXXXX"
                      autoComplete="tel"
                      required
                    />
                  </div>
                </label>

                <label>
                  <span>Receive verification through</span>
                  <select
                    value={verificationChannel}
                    onChange={event => setVerificationChannel(event.target.value as 'email' | 'sms')}
                    required
                  >
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                  </select>
                </label>
              </>
            )}

            <label>
              <span>Email address</span>
              <div className="auth-input-wrap">
                <Mail size={17} />
                <input
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
            </label>

            <label>
              <span>Password</span>
              <div className="auth-input-wrap">
                <LockKeyhole size={17} />
                <input
                  type="password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                  minLength={8}
                  required
                />
              </div>
              {authMode === 'register' && (
                <small className="auth-hint">Use at least 8 characters.</small>
              )}
            </label>

            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting
                ? <><LoaderCircle size={17} className="auth-spinner" /> Please wait...</>
                : <>{authMode === 'login' ? 'Sign in to Learnova' : 'Create account'} <ArrowUpRight size={17} /></>}
            </button>
            </form>
          )}

          <div className="auth-switch">
            {authMode === 'login' ? "Don't have an account?" : 'Already have an account?'}
            <button
              type="button"
              onClick={() => {
                setVerificationPending(false)
                setVerificationCode('')
                setAuthMode(authMode === 'login' ? 'register' : 'login')
                setAuthError('')
                setAuthNotice('')
              }}
            >
              {authMode === 'login' ? 'Create one' : 'Sign in'}
            </button>
          </div>

          <div className="auth-security">
            <LockKeyhole size={14} />
            Your account is protected by Learnova session security.
          </div>
        </div>
        <div className="auth-footer">© 2026 Learnova. Learn · Grow · Excel.</div>
      </div>
    )
  }

  const displayName = user.display_name || user.email.split('@')[0] || 'Student'
  const initials = displayName
    .split(/\s+/)
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="app-shell">
      {securityWarning && (
        <div className="security-warning">
          <span>{securityWarning}</span>
          <button onClick={() => setSecurityWarning('')} aria-label="Dismiss warning"><X size={16} /></button>
        </div>
      )}

      {mobileMenu && <button className="mobile-overlay" aria-label="Close menu" onClick={() => setMobileMenu(false)} />}

      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-icon"><GraduationCap size={25} /></div>
          <div>
            <strong>Learnova</strong>
            <span>LEARN · GROW · EXCEL</span>
          </div>
          <button className="close-menu" onClick={() => setMobileMenu(false)} aria-label="Close menu"><X /></button>
        </div>

        <div className="nav-label">MENU</div>
        <nav className="main-nav">
          {navigation.map(item => {
            const Icon = item.icon
            return (
              <button key={item.label} className={`nav-item ${activePage === item.label ? 'active' : ''}`} onClick={() => navigate(item.label)}>
                <Icon size={19} />
                <span>{item.label}</span>
                {item.label === 'AI tutor' && <span className="new-tag">NEW</span>}
              </button>
            )
          })}
        </nav>

        <div className="nav-label tools-label">YOUR TOOLS</div>
        <button className="nav-item" onClick={() => navigate('Study planner')}><Layers size={19} /><span>Flashcards</span></button>
        <button className="nav-item" onClick={() => navigate('Study planner')}><Target size={19} /><span>Practice tests</span></button>

        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <div className="upgrade-icon"><Sparkles size={19} /></div>
            <strong>Unlock your potential</strong>
            <p>Get more from your learning journey.</p>
            <button onClick={() => navigate('Subscription')}>Explore plans <ArrowUpRight size={15} /></button>
          </div>
          <button className="profile-mini" onClick={() => navigate('Settings')}>
            <div className="avatar">{initials}</div>
            <div className="profile-info"><strong>{displayName}</strong><span>{user.role || 'Student'} account</span></div>
            <MoreHorizontal size={19} />
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="menu-button" onClick={() => setMobileMenu(true)} aria-label="Open menu"><Menu /></button>
            <div className="breadcrumb">Workspace <span>/</span> <strong>{activePage}</strong></div>
          </div>
          <div className="topbar-actions">
            <label className="search-box">
              <Search size={18} />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search courses, materials..." />
              <kbd>⌘ K</kbd>
            </label>
            <button className="icon-button notification-button" aria-label="Notifications"><Bell size={19} /><i /></button>
            <button className="top-profile" onClick={handleLogout} title="Sign out">
              <div className="avatar">{initials}</div>
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <div className="page-content">
          <section className="welcome-row">
            <div>
              <div className="eyebrow"><Sparkles size={15} /> YOUR LEARNING SPACE</div>
              <h1>{activePage === 'Overview' ? `Welcome, ${displayName}` : activePage}<span className="wave">✦</span></h1>
              <p className="welcome-subtitle">Every small step brings you closer to your goals. Let's make today count.</p>
            </div>
            <div className="date-chip"><CalendarDays size={16} /> Your Learnova workspace</div>
          </section>

          <section className="hero-banner">
            <div className="hero-copy">
              <span className="hero-kicker"><Sparkles size={14} /> YOUR PERSONAL LEARNING COMPANION</span>
              <h2>Make today a<br /><span>great learning day.</span></h2>
              <p>Your next breakthrough is one lesson away. Keep going!</p>
              <button className="hero-button" onClick={() => navigate('My courses')}>Continue learning <ArrowUpRight size={17} /></button>
            </div>
            <div className="hero-art">
              <div className="art-circle circle-one" />
              <div className="art-circle circle-two" />
              <div className="art-book">📖</div>
              <div className="art-star star-one">✦</div>
              <div className="art-star star-two">✧</div>
              <div className="floating-note"><Flame size={17} /> 7 day streak</div>
              <div className="floating-progress"><TrendingUp size={17} /> You're improving!</div>
            </div>
          </section>

          <section className="stats-grid">
            <article className="stat-card">
              <div className="stat-top"><span className="stat-icon purple-icon"><BookOpen size={19} /></span><span className="stat-change">Sample data</span></div>
              <strong>12</strong><span className="stat-caption">Courses enrolled</span>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span className="stat-icon blue-icon"><Clock3 size={19} /></span><span className="stat-change">Sample data</span></div>
              <strong>24.5 <small>hrs</small></strong><span className="stat-caption">Learning time</span>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span className="stat-icon orange-icon"><Target size={19} /></span><span className="stat-change">Sample data</span></div>
              <strong>86<small>%</small></strong><span className="stat-caption">Average performance</span>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span className="stat-icon green-icon"><Flame size={19} /></span><span className="stat-change">Sample data</span></div>
              <strong>7 <small>days</small></strong><span className="stat-caption">Learning streak</span>
            </article>
          </section>

          <div className="content-grid">
            <section className="courses-section">
              <div className="section-heading">
                <div><h3>Continue learning</h3><p>Sample courses — database connection is next</p></div>
                <button className="text-link" onClick={() => navigate('My courses')}>View all courses <ArrowUpRight size={15} /></button>
              </div>
              <div className="course-list">
                {filteredCourses.map(course => (
                  <article className="course-card" key={course.id}>
                    <div className={`course-symbol ${course.color}`}>{course.icon}</div>
                    <div className="course-details">
                      <span className="course-code">{course.code}</span>
                      <h4>{course.name}</h4>
                      <div className="progress-meta"><span>{course.lessons}</span><strong>{course.progress}%</strong></div>
                      <div className="progress-track"><div className={`progress-fill ${course.color}`} style={{ width: `${course.progress}%` }} /></div>
                    </div>
                    <button className="course-play" aria-label={`Continue ${course.name}`} onClick={() => navigate('My courses')}><Play size={17} fill="currentColor" /></button>
                  </article>
                ))}
                {filteredCourses.length === 0 && <div className="empty-state">No matching courses found. Try another search.</div>}
              </div>
            </section>

            <section className="tutor-section">
              <div className="section-heading"><div><h3>Your AI study buddy</h3><p>Here whenever you need help</p></div><span className="online-dot" /></div>
              <div className="tutor-card">
                <div className="tutor-top"><div className="tutor-avatar"><BrainCircuit size={25} /></div><div><strong>Meet your AI tutor</strong><span><i /> Coming in a later stage</span></div></div>
                <p className="tutor-description">The AI tutor will be connected after the academic library and request-processing system are ready.</p>
                <div className="suggestion-chips">
                  <button type="button" onClick={() => setQuestion('Explain a difficult topic to me')}>Explain a topic</button>
                  <button type="button" onClick={() => setQuestion('Help me prepare for exams')}>Exam preparation</button>
                  <button type="button" onClick={() => setQuestion('Create practice questions for me')}>Practice questions</button>
                </div>
                {messages.map((message, index) => <div className="demo-message" key={index}><MessageCircle size={14} /> {message}</div>)}
                <form className="tutor-input" onSubmit={askTutor}>
                  <input value={question} onChange={event => setQuestion(event.target.value)} placeholder="AI tutor is not connected yet" aria-label="Ask your AI tutor" disabled />
                  <button type="submit" aria-label="Send question" disabled><Send size={17} /></button>
                </form>
                <span className="tutor-footnote"><Sparkles size={12} /> Your academic resources will power the tutor.</span>
              </div>
            </section>
          </div>

          <div className="bottom-grid">
            <section className="activity-section">
              <div className="section-heading"><div><h3>Upcoming activities</h3><p>Sample activities — planner connection is next</p></div><button className="text-link" onClick={() => navigate('Study planner')}>See calendar <ArrowUpRight size={15} /></button></div>
              <div className="activity-row"><div className="activity-date"><strong>22</strong><span>NOV</span></div><div className="activity-info"><strong>Business Statistics CAT</strong><span><Clock3 size={13} /> Sample activity</span></div><span className="activity-type assessment">Assessment</span></div>
              <div className="activity-row"><div className="activity-date blue-date"><strong>25</strong><span>NOV</span></div><div className="activity-info"><strong>Research proposal submission</strong><span><Clock3 size={13} /> Sample activity</span></div><span className="activity-type assignment">Assignment</span></div>
            </section>
            <section className="goal-section">
              <div className="section-heading"><div><h3>Weekly goal</h3><p>Sample learning goal</p></div><Target size={20} className="goal-heading-icon" /></div>
              <div className="goal-number"><strong>8.5</strong><span>/ 12 hours</span></div>
              <div className="goal-track"><div /></div>
              <div className="goal-footer"><span><CheckCircle2 size={14} /> 71% completed</span><span>3.5 hrs to go</span></div>
            </section>
          </div>

          <footer className="footer">
            <span>© 2026 Learnova. Built for your learning journey.</span>
            <button className="logout-footer" onClick={handleLogout}><LogOut size={14} /> Sign out</button>
            <span><Headphones size={14} /> Need help? We're here for you.</span>
          </footer>
        </div>
      </main>
    </div>
  )
}

export default App








