import {
  createContext, useContext, useEffect, useRef, useState,
  type Dispatch, type FormEvent, type ReactNode, type SetStateAction
} from 'react'
import {
  BrowserRouter, Routes, Route, NavLink, Navigate,
  useNavigate, useLocation, useParams, useSearchParams
} from 'react-router-dom'
import {
  GraduationCap, BookOpen, CalendarDays, BrainCircuit, Search,
  Menu, User, LoaderCircle, Target, FileText, Bell, Compass,
  ClipboardList, Clock, Briefcase, FolderOpen, Home, Plus, Send,
  ChevronRight, ArrowLeft, X, Moon, Sun, Eye, EyeOff, Trophy,
  Settings, Lightbulb, MoreVertical, Mic, Timer, Award, AlertCircle
} from 'lucide-react'
import './App.css'
import './Auth.css'

const API_URL = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? `http://${window.location.hostname}:4000` : '')
).replace(/\/+$/, '')

type StudentMetadata = {
  display_name?: string
  phone_number?: string
  phone?: string
  address?: string
  institution?: string
  faculty?: string
  academic_year?: string
  english_level?: string
}

type AuthUser = {
  id: string
  email: string
  display_name?: string
  role?: string
  avatar_url?: string | null
  phone_number?: string
  address?: string
  institution?: string
  faculty?: string
  academic_year?: string
  english_level?: string
}

type AuthResponse = {
  success?: boolean
  message?: string
  session?: { access_token?: string; session_id?: string }
  access_token?: string
  session_id?: string
}

type DashboardCourse = {
  id: string
  title: string
  code?: string | null
  description?: string | null
  total_lessons?: number
  completed_lessons?: number
  progress?: number
  progress_percentage?: number
  progress_percent?: number
  level?: string | null
}

type CourseLesson = {
  id: string
  course_id: string
  title: string
  content?: string | null
  position?: number
  completed?: boolean
}

type AcademicRecord = {
  id: string
  course_id?: string
  assessment_name?: string
  score?: number
  max_score?: number
  feedback?: string | null
  recorded_at?: string
}

type ApiResult = {
  success?: boolean
  message?: string
  reply?: string // Added for AI
  user?: { id: string; email?: string; metadata?: StudentMetadata }
  profile?: { display_name?: string; role?: string; avatar_url?: string | null }
  summary?: any
  courses?: DashboardCourse[]
  academic_records?: AcademicRecord[]
  course?: DashboardCourse
  lessons?: CourseLesson[]
  lesson?: CourseLesson
  completed?: boolean
}

type Msg = { role: 'user' | 'ai'; text: string }

type Ctx = {
  user: AuthUser
  dashboard: ApiResult | null
  loading: boolean
  api: (path: string, options?: RequestInit) => Promise<ApiResult>
  refresh: () => Promise<void>
  logout: () => void
  theme: 'light' | 'dark'
  toggleTheme: () => void
  messages: Msg[]
  setMessages: Dispatch<SetStateAction<Msg[]>>
  activeCategory: string
  setActiveCategory: Dispatch<SetStateAction<string>>
}

const AppCtx = createContext<Ctx>(null as unknown as Ctx)
const useApp = () => useContext(AppCtx)

const rel = (n: number) =>
  n < 0 ? 'Past due' : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `In ${n} days`

const fmtSize = (b: number) =>
  b > 1048576
    ? `${(b / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(b / 1024))} KB`

const pct = (c: DashboardCourse) => {
  const v = c.progress_percentage ?? c.progress_percent ?? c.progress
  if (typeof v === 'number') return Math.max(0, Math.min(100, Math.round(v)))
  return c.total_lessons
    ? Math.round(((c.completed_lessons || 0) / c.total_lessons) * 100)
    : 0
}

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase() || 'S'

const greetingForTime = () => {
  const hour = new Date().getHours()
  if (hour < 12) return { greeting: 'Good morning', prompt: 'Ready to make today count?' }
  if (hour < 17) return { greeting: 'Good afternoon', prompt: 'What would you like to work on?' }
  if (hour < 21) return { greeting: 'Good evening', prompt: 'Let\'s make some progress before the day ends.' }
  return { greeting: 'Hello', prompt: 'Taking a late study session? What\'s on your mind?' }
}

const TIMETABLE: Record<string, { t: string; n: string; r: string }[]> = {
  Monday: [{ t: '09:00', n: 'Mathematics', r: 'Room 204' }, { t: '13:00', n: 'English', r: 'Room 101' }],
  Tuesday: [{ t: '11:00', n: 'Physics Lab', r: 'Lab 3' }],
  Wednesday: [{ t: '10:00', n: 'English', r: 'Room 101' }, { t: '14:00', n: 'Mathematics', r: 'Room 204' }],
  Thursday: [{ t: '14:00', n: 'Biology', r: 'Room 305' }],
  Friday: [{ t: '09:00', n: 'History', r: 'Room 102' }, { t: '11:30', n: 'Physics', r: 'Room 210' }]
}

const ASSIGNMENTS = [
  { title: 'Calculus problem set', course: 'Mathematics', off: 1, status: 'pending' },
  { title: 'Essay on Shakespeare', course: 'English', off: 3, status: 'pending' },
  { title: 'Cell structure diagram', course: 'Biology', off: 6, status: 'pending' },
  { title: 'Physics lab report', course: 'Physics', off: -7, status: 'graded', grade: '88%' }
]

const UPCOMING = [
  { off: 1, title: 'Math quiz', type: 'Test' },
  { off: 3, title: 'Submit Shakespeare essay', type: 'Assignment' },
  { off: 5, title: 'Physics lab session', type: 'Class' },
  { off: 9, title: 'Biology midterm', type: 'Exam' }
]

const DOCS0 = [
  { name: 'Lab report.pdf', size: '2.4 MB', cat: 'Modules' },
  { name: 'Study notes.docx', size: '1.1 MB', cat: 'Personal' },
  { name: 'Calculus summary.pdf', size: '5.0 MB', cat: 'Modules' },
  { name: 'Project brief.pdf', size: '800 KB', cat: 'Personal' }
]

const NOTIFS0 = [
  { id: 1, title: 'New grade posted', desc: 'Your physics lab report has been graded.', time: '2 hours ago', unread: true },
  { id: 2, title: 'Class reminder', desc: 'Mathematics starts in 30 minutes.', time: '5 hours ago', unread: true },
  { id: 3, title: 'Welcome to Learnova', desc: 'Open a module to start your first lesson.', time: 'Yesterday', unread: false }
]

const QUESTIONS: Record<string, { q: string; o: string[]; a: number }[]> = {
  Mathematics: [
    { q: 'What is 12 × 12?', o: ['124', '144', '154', '164'], a: 1 },
    { q: 'What is the derivative of x²?', o: ['x', '2x', 'x³', '2'], a: 1 },
    { q: 'Solve: 2x + 6 = 14', o: ['x = 3', 'x = 4', 'x = 5', 'x = 10'], a: 1 },
    { q: 'What is the area of a circle with radius 3?', o: ['6π', '9π', '3π', '12π'], a: 1 },
    { q: 'What is √81?', o: ['7', '8', '9', '10'], a: 2 }
  ],
  English: [
    { q: 'Which word is closest in meaning to "rapid"?', o: ['Slow', 'Quick', 'Quiet', 'Late'], a: 1 },
    { q: 'What is the past tense of "go"?', o: ['Goed', 'Gone', 'Went', 'Going'], a: 2 },
    { q: 'Which of these is a noun?', o: ['Happiness', 'Quickly', 'Brave', 'Run'], a: 0 },
    { q: 'Which sentence is correct?', o: ["She don't like tea", "She doesn't like tea", "She not like tea", "She doesn't likes tea"], a: 1 },
    { q: 'What is the opposite of "ancient"?', o: ['Old', 'Historic', 'Modern', 'Large'], a: 2 }
  ],
  Physics: [
    { q: 'What is the SI unit of force?', o: ['Joule', 'Watt', 'Newton', 'Pascal'], a: 2 },
    { q: 'Approximate speed of light?', o: ['3×10⁶ m/s', '3×10⁸ m/s', '3×10¹⁰ m/s', '3×10⁴ m/s'], a: 1 },
    { q: "Newton's second law is…", o: ['E = mc²', 'V = IR', 'F = ma', 'P = mv'], a: 2 },
    { q: 'Which quantity is a vector?', o: ['Mass', 'Speed', 'Velocity', 'Time'], a: 2 },
    { q: 'What is the SI unit of energy?', o: ['Joule', 'Newton', 'Volt', 'Hertz'], a: 0 }
  ],
  Biology: [
    { q: "Which organelle produces most of a cell's energy?", o: ['Nucleus', 'Ribosome', 'Mitochondrion', 'Vacuole'], a: 2 },
    { q: 'Which gas do plants absorb for photosynthesis?', o: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen'], a: 2 },
    { q: 'What does DNA stand for?', o: ['Deoxyribonucleic acid', 'Dinitrogen acid', 'Dual nucleic atom', 'Dextrose nucleic acid'], a: 0 },
    { q: 'What is the basic unit of life?', o: ['Atom', 'Cell', 'Tissue', 'Organ'], a: 1 },
    { q: 'Which cells carry oxygen in blood?', o: ['White cells', 'Platelets', 'Red cells', 'Plasma'], a: 2 }
  ]
}

async function request(
  path: string,
  options: RequestInit = {},
  token?: string,
  session?: string
): Promise<ApiResult> {
  if (!API_URL) {
    throw new Error('The production API URL is missing. Set VITE_API_URL in your frontend deployment settings.')
  }

  const headers = new Headers(options.headers)
  if (options.body) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (session) headers.set('x-learnova-session', session)

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers })
  } catch {
    throw new Error('Could not connect to Learnova server. Check your internet connection or server status.')
  }

  const result = (await response.json().catch(() => ({}))) as ApiResult
  if (!response.ok || result.success === false) {
    throw new Error(result.message || `Request failed (${response.status}).`)
  }
  return result
}

const getDeviceLabel = () =>
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop'

function createAuthUser(result: ApiResult): AuthUser {
  const m = result.user?.metadata || {}
  return {
    id: result.user?.id || '',
    email: result.user?.email || '',
    display_name: result.profile?.display_name || m.display_name || '',
    role: result.profile?.role || 'student',
    avatar_url: result.profile?.avatar_url || null,
    phone_number: m.phone_number || m.phone || '',
    address: m.address || '',
    institution: m.institution || '',
    faculty: m.faculty || '',
    academic_year: m.academic_year || '',
    english_level: m.english_level || ''
  }
}

const Loading = ({ label = 'Loading…' }: { label?: string }) => (
  <div style={{ minHeight: '50vh', display: 'grid', placeItems: 'center', color: 'var(--brand)' }}>
    <LoaderCircle className="spin" size={32} aria-label={label} />
  </div>
)

const Empty = ({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) => (
  <div className="empty" style={{ padding: 40, textAlign: 'center', border: '2px dashed var(--line)', borderRadius: 24, background: 'var(--surface)' }}>
    <strong>{title}</strong>
    {hint && <span>{hint}</span>}
    {action}
  </div>
)

const PageHead = ({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) => (
  <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <div>
      <h1>{title}</h1>
      {sub && <p>{sub}</p>}
    </div>
    {right}
  </div>
)

// CHAT PANEL (Now connected to real AI!)
function ChatPanel({ full, onClose }: { full?: boolean; onClose?: () => void }) {
  const { messages, setMessages, api } = useApp()
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typing])

  async function send(text: string) {
    const t = text.trim()
    if (!t || typing) return

    setMessages(p => [...p, { role: 'user', text: t }])
    setInput('')
    setTyping(true)

    try {
      const result = await api('/api/ai/chat', { 
        method: 'POST', 
        body: JSON.stringify({ message: t }) 
      })
      if (result.reply) {
        setMessages(p => [...p, { role: 'ai', text: result.reply as string }])
      } else {
        setMessages(p => [...p, { role: 'ai', text: 'Sorry, I could not process that.' }])
      }
    } catch (err) {
      setMessages(p => [...p, { role: 'ai', text: 'AI is temporarily unavailable. Check your API keys on Render.' }])
    } finally { 
      setTyping(false) 
    }
  }

  return (
    <div className={`chat ${full ? 'full' : ''}`}>
      <div className="chat-header">
        <div className="chat-ai-avatar"><BrainCircuit size={22} /></div>
        <div className="grow"><strong>Jonathan AI</strong><small>Your study partner</small></div>
        {onClose && <button className="icon-btn" onClick={onClose}><X size={20} /></button>}
      </div>

      <div className="chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>{m.text}</div>
        ))}
        {typing && (
          <div className="bubble ai typing" style={{ display: 'flex', gap: 4 }}>
            <span className="dot">.</span><span className="dot">.</span><span className="dot">.</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="chat-input-area">
        <form className="chat-input" onSubmit={e => { e.preventDefault(); send(input) }}>
          <input
            ref={fileRef}
            type="file"
            hidden
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) send(`I would like help with this document: ${f.name}`)
              e.target.value = ''
            }}
          />
          <button type="button" className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => fileRef.current?.click()}>
            <Plus size={18} />
          </button>
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask Jonathan anything..." />
          <button type="submit" className="icon-btn send" disabled={!input.trim() || typing}>
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  )
}

// LAYOUT
function AppLayout({ children }: { children: ReactNode }) {
  const { user, theme, toggleTheme } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [menu, setMenu] = useState(false)

  const name = user.display_name || user.email.split('@')[0] || 'Student'
  const isHome = location.pathname === '/'
  const isAI = location.pathname === '/ai-tutor'

  useEffect(() => {
    setMenu(false)
    window.scrollTo(0, 0)
  }, [location.pathname])

  useEffect(() => {
    document.body.classList.toggle('ai-full-mode', isAI && window.innerWidth <= 768)
    return () => document.body.classList.remove('ai-full-mode')
  }, [isAI])

  return (
    <div className="app-shell">
      {menu && <div className="overlay" onClick={() => setMenu(false)} />}

      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-icon"><GraduationCap size={22} /></div>
          <strong>Learnova</strong>
        </div>

        <nav className="nav-group">
          <div className="nav-label">Learn</div>
          {[
            { label: 'Home', path: '/', icon: Home },
            { label: 'Modules', path: '/modules', icon: BookOpen },
            { label: 'Quick Test', path: '/quick-test', icon: Target },
            { label: 'Explore', path: '/explore', icon: Compass },
            { label: 'My Documents', path: '/documents', icon: FolderOpen }
          ].map(i => (
            <NavLink key={i.path} to={i.path} end={i.path === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <i.icon size={20} /><span>{i.label}</span>
            </NavLink>
          ))}
        </nav>

        <nav className="nav-group">
          <div className="nav-label">Plan</div>
          {[
            { label: 'Time Table', path: '/timetable', icon: CalendarDays },
            { label: 'Assignments', path: '/assignments', icon: ClipboardList },
            { label: 'Upcoming', path: '/upcoming', icon: Clock },
            { label: 'Academic Records', path: '/records', icon: FileText }
          ].map(i => (
            <NavLink key={i.path} to={i.path} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <i.icon size={20} /><span>{i.label}</span>
            </NavLink>
          ))}
        </nav>

        <nav className="nav-group">
          <div className="nav-label">Support</div>
          {[
            { label: 'Work With Me', path: '/work-with-me', icon: Briefcase },
            { label: 'Notifications', path: '/notifications', icon: Bell }
          ].map(i => (
            <NavLink key={i.path} to={i.path} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <i.icon size={20} /><span>{i.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="profile-mini" onClick={() => navigate('/profile')}>
            <span className="avatar">{initialsOf(name)}</span>
            <span className="profile-info"><strong>{name}</strong><span>{user.role}</span></span>
            <Settings size={20} color="var(--muted)" />
          </button>
        </div>
      </aside>

      <div className="main-wrapper">
        <div className="center-panel">
          <header className="topbar">
            <button className="icon-btn menu-btn" onClick={() => setMenu(true)}><Menu size={24} /></button>
            <div className="header-search">
              <div className="search">
                <Search size={20} />
                <input
                  placeholder="Search your learning..."
                  onKeyDown={e => {
                    if (e.key === 'Enter') navigate(`/modules?q=${encodeURIComponent(e.currentTarget.value)}`)
                  }}
                />
                <Mic size={20} />
              </div>
            </div>
            <div className="topbar-actions">
              <button className="icon-btn" onClick={toggleTheme}>
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <button className="header-avatar" onClick={() => navigate('/profile')}>{initialsOf(name)}</button>
            </div>
          </header>

          <main className="content">
            {isAI
              ? <div className="ai-full-page" style={{ height: 'calc(100vh - 76px)', padding: 0 }}><ChatPanel full /></div>
              : children}
          </main>
        </div>

        <aside className="ai-panel">
          <ChatPanel />
        </aside>
      </div>

      <nav className="bottom-nav">
        <button className={`bn-item ${isHome ? 'active' : ''}`} onClick={() => navigate('/')}>
          <Home size={24} /><span>Home</span>
        </button>
        <NavLink to="/ai-tutor" className={({ isActive }) => `bn-item ${isActive ? 'active' : ''}`}>
          <BrainCircuit size={24} /><span>AI</span>
        </NavLink>
        <NavLink to="/documents" className={({ isActive }) => `bn-item ${isActive ? 'active' : ''}`}>
          <FolderOpen size={24} /><span>Docs</span>
        </NavLink>
      </nav>
    </div>
  )
}

// HOME
function HomePage() {
  const { user, dashboard, loading } = useApp()
  const navigate = useNavigate()
  const name = (user.display_name || user.email.split('@')[0] || 'Student').trim().split(/\s+/)[0]
  const timeGreeting = greetingForTime()
  const courses = dashboard?.courses || []

  return (
    <div className="page">
      <div className="welcome-section">
        <div>
          <h1>{timeGreeting.greeting}, {name}</h1>
          <p>{timeGreeting.prompt}</p>
        </div>
      </div>

      <div className="home-tiles">
        <button className="home-tile tile-modules" onClick={() => navigate('/modules')}>
          <span className="tile-icon"><BookOpen size={24} color="#182238" /></span>
          <strong>Courses</strong>
        </button>
        <button className="home-tile tile-test" onClick={() => navigate('/quick-test')}>
          <span className="tile-icon"><Lightbulb size={24} color="#fff" /></span>
          <strong>Teach me</strong>
        </button>
        <button className="home-tile tile-awake" onClick={() => navigate('/wake-up')}>
          <span className="tile-icon"><Timer size={24} color="#182238" /></span>
          <strong>Wake me</strong>
        </button>
        <button className="home-tile tile-timetable" onClick={() => navigate('/timetable')}>
          <span className="tile-icon"><CalendarDays size={24} color="#182238" /></span>
          <strong>Timetable</strong>
        </button>
      </div>

      <div className="section-head">
        <div><h2>Quick Links</h2><p>Jump right back in.</p></div>
      </div>

      <div className="quick-links-grid">
        <div className="quick-link-card" onClick={() => navigate('/assignments')}>
          <div className="quick-link-icon"><ClipboardList size={20} /></div>
          <strong>Assignments</strong><span>2 pending</span>
        </div>
        <div className="quick-link-card" onClick={() => navigate('/upcoming')}>
          <div className="quick-link-icon"><Clock size={20} /></div>
          <strong>Upcoming</strong><span>Math quiz tomorrow</span>
        </div>
        <div className="quick-link-card" onClick={() => navigate('/work-with-me')}>
          <div className="quick-link-icon"><Briefcase size={20} /></div>
          <strong>Work With Me</strong><span>Book a tutor</span>
        </div>
        <div className="quick-link-card" onClick={() => navigate('/records')}>
          <div className="quick-link-icon"><FileText size={20} /></div>
          <strong>Records</strong><span>{loading ? 'Loading records…' : `${courses.length} courses`}</span>
        </div>
      </div>
    </div>
  )
}

// DOCUMENTS
function DocumentsPage() {
  const [docs, setDocs] = useState(DOCS0)
  const [cat, setCat] = useState('All')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setDocs(prev => [{ name: file.name, size: fmtSize(file.size), cat: 'Personal' }, ...prev])
    e.target.value = ''
  }

  const filtered = cat === 'All'
    ? docs
    : docs.filter(d => cat === 'Uploader' ? d.cat === 'Personal' : d.cat === 'Modules')

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 36, fontWeight: 800, margin: 0, letterSpacing: '-1px' }}>My Documents</h1>
        <button className="icon-btn" onClick={() => fileInputRef.current?.click()}><Plus size={20} /></button>
      </div>

      <div className="chips" style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        {['All', 'Course', 'Module', 'Uploader'].map(c => (
          <button
            key={c}
            className={`chip ${cat === c ? 'active' : ''}`}
            onClick={() => setCat(c)}
            style={{
              padding: '8px 16px', borderRadius: 30, border: '1px solid var(--line)',
              background: cat === c ? 'var(--brand-soft)' : 'var(--surface)',
              color: cat === c ? 'var(--brand)' : 'var(--muted)',
              fontWeight: 700, cursor: 'pointer'
            }}
          >
            {c} <ChevronRight size={14} style={{ transform: 'rotate(90deg)' }} />
          </button>
        ))}
      </div>

      <div className="doc-list">
        {filtered.map((d, i) => (
          <div className="doc-card" key={d.name + i}>
            <div className="row-icon" style={{ background: '#fff0f0', color: '#DF535B' }}><FileText size={24} /></div>
            <div className="row-main"><strong>{d.name}</strong><span>{d.size} • {d.cat}</span></div>
            <button className="icon-btn" aria-label={`Options for ${d.name}`}><MoreVertical size={20} /></button>
          </div>
        ))}
        {!filtered.length && <Empty title="No documents in this category" />}
      </div>

      <input type="file" ref={fileInputRef} onChange={handleUpload} style={{ display: 'none' }} />
      <button className="fab" onClick={() => fileInputRef.current?.click()} title="Upload Document">
        <Plus size={24} />
      </button>
    </div>
  )
}

// QUICK TEST
function QuickTestPage() {
  const [subject, setSubject] = useState<string | null>(null)
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [done, setDone] = useState(false)
  const qs = subject ? QUESTIONS[subject] : []

  const reset = () => {
    setSubject(null)
    setI(0)
    setPicked(null)
    setScore(0)
    setDone(false)
  }

  if (!subject) {
    return (
      <div className="page">
        <PageHead title="Quick test" sub="Select a subject to begin." />
        <div className="grid c2">
          {Object.keys(QUESTIONS).map(s => (
            <button className="card" key={s} onClick={() => setSubject(s)} style={{ cursor: 'pointer', textAlign: 'left' }}>
              <div className="row-icon" style={{ marginBottom: 16 }}><Target size={24} /></div>
              <h3>{s}</h3><p style={{ color: 'var(--muted)' }}>{QUESTIONS[s].length} questions</p>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="page" style={{ alignItems: 'center', marginTop: 40 }}>
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <Trophy size={48} color="var(--brand)" style={{ marginBottom: 16 }} />
          <h2 style={{ fontSize: 32 }}>{score}/{qs.length}</h2>
          <p style={{ color: 'var(--muted)', marginBottom: 24 }}>You scored {Math.round((score / qs.length) * 100)}%</p>
          <button className="btn" onClick={reset}>Try Again</button>
        </div>
      </div>
    )
  }

  const q = qs[i]

  return (
    <div className="page" style={{ maxWidth: 600, margin: '0 auto' }}>
      <button className="back" onClick={reset}><ArrowLeft size={16} />Exit</button>
      <div className="card">
        <p style={{ fontWeight: 700, color: 'var(--brand)' }}>Question {i + 1} of {qs.length}</p>
        <h2 style={{ fontSize: 24, margin: '16px 0 24px' }}>{q.q}</h2>
        <div className="stack">
          {q.o.map((o, n) => (
            <button
              key={o}
              disabled={picked !== null}
              onClick={() => { setPicked(n); if (n === q.a) setScore(s => s + 1) }}
              className={`option ${picked !== null && n === q.a ? 'correct' : ''} ${picked === n && n !== q.a ? 'wrong' : ''}`}
            >
              <b>{String.fromCharCode(65 + n)}</b> {o}
            </button>
          ))}
        </div>
        <button
          className="btn"
          style={{ marginTop: 24, width: '100%' }}
          disabled={picked === null}
          onClick={() => {
            if (i + 1 >= qs.length) setDone(true)
            else { setI(i + 1); setPicked(null) }
          }}
        >
          {i + 1 >= qs.length ? 'Finish' : 'Next'}
        </button>
      </div>
    </div>
  )
}

// WAKE ME UP — TIMED ALERTNESS CHALLENGE
function WakeUpPage() {
  const [state, setState] = useState<'intro' | 'test' | 'result'>('intro')
  const [questions, setQuestions] = useState<{ q: string; o: string[]; a: number; subject: string }[]>([])
  const [currentQ, setCurrentQ] = useState(0)
  const [score, setScore] = useState(0)
  const [timeLeft, setTimeLeft] = useState(75)
  const [answered, setAnswered] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const [startedAt, setStartedAt] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<number | null>(null)

  const stopTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const finishTest = (finalScore: number, ranOut = false) => {
    stopTimer()
    setScore(finalScore)
    setTimedOut(ranOut)
    setElapsed(Math.max(0, Math.round((Date.now() - startedAt) / 1000)))
    setState('result')
  }

  const startExam = () => {
    stopTimer()

    const allQs = Object.entries(QUESTIONS).flatMap(([subject, qs]) =>
      qs.map(q => ({ ...q, subject }))
    )

    const shuffled = [...allQs]
      .sort(() => Math.random() - 0.5)
      .slice(0, 10)

    setQuestions(shuffled)
    setCurrentQ(0)
    setScore(0)
    setTimeLeft(75)
    setAnswered(false)
    setTimedOut(false)
    setElapsed(0)
    setStartedAt(Date.now())
    setState('test')

    timerRef.current = window.setInterval(() => {
      setTimeLeft(previous => {
        if (previous <= 1) {
          window.clearInterval(timerRef.current!)
          timerRef.current = null
          setTimedOut(true)
          setState('result')
          setElapsed(Math.max(0, Math.round((Date.now() - Date.now()) / 1000)))
          return 0
        }
        return previous - 1
      })
    }, 1000)
  }

  const handleAnswer = (idx: number) => {
    if (answered || state !== 'test') return

    setAnswered(true)
    const correct = idx === questions[currentQ].a
    const nextScore = score + (correct ? 1 : 0)
    setScore(nextScore)

    window.setTimeout(() => {
      if (currentQ + 1 >= questions.length) {
        finishTest(nextScore)
      } else {
        setCurrentQ(c => c + 1)
        setAnswered(false)
      }
    }, 350)
  }

  useEffect(() => () => stopTimer(), [])

  if (state === 'intro') {
    return (
      <div className="page">
        <PageHead title="Wake Me Up" sub="A short challenge to check your alertness." />
        <div className="exam-container">
          <div className="exam-card">
            <AlertCircle size={48} color="var(--brand)" style={{ marginBottom: 24 }} />
            <h2 className="exam-title">Are you alert and ready?</h2>
            <p className="exam-desc">
              This is an active challenge, not a reminder. Answer 10 mixed questions
              under a time limit. You must stay focused and respond to each question.
            </p>
            <div className="exam-stats">
              <div className="exam-stat-item"><strong>10</strong><span>Questions</span></div>
              <div className="exam-stat-item"><strong>75s</strong><span>Time limit</span></div>
              <div className="exam-stat-item"><strong>8/10</strong><span>Pass mark</span></div>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>
              This is a study focus check, not a medical test or a guarantee that you are safe to drive or perform risky tasks.
            </p>
            <button className="btn" style={{ width: '100%', minHeight: 56, fontSize: 18 }} onClick={startExam}>
              Start alertness test
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'test') {
    const q = questions[currentQ]

    return (
      <div className="page">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, color: 'var(--brand)' }}>Question {currentQ + 1} of 10</div>
          <div className="exam-timer" style={{ color: timeLeft <= 15 ? 'var(--danger)' : undefined }}>
            {timeLeft}s
          </div>
        </div>

        <div className="exam-card" style={{ padding: 32, maxWidth: '100%' }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>
            {q.subject}
          </p>
          <h2 style={{ fontSize: 24, marginBottom: 32 }}>{q.q}</h2>
          <div className="stack">
            {q.o.map((o, n) => (
              <button
                key={o}
                disabled={answered}
                onClick={() => handleAnswer(n)}
                className={`option ${answered && n === q.a ? 'correct' : ''} ${answered && n !== q.a && n === -1 ? 'wrong' : ''}`}
                style={{ minHeight: 56 }}
              >
                <b>{String.fromCharCode(65 + n)}</b> {o}
              </button>
            ))}
          </div>
          <p style={{ marginTop: 20, color: 'var(--muted)', fontSize: 13 }}>
            Stay focused. Your time is running.
          </p>
        </div>
      </div>
    )
  }

  const passed = score >= 8 && !timedOut

  return (
    <div className="page">
      <div className="exam-container">
        <div className="exam-card">
          {passed
            ? <Award size={64} color="var(--success)" style={{ marginBottom: 16 }} />
            : <AlertCircle size={64} color="var(--danger)" style={{ marginBottom: 16 }} />
          }
          <h2 className="exam-title">{passed ? 'Alertness check passed' : 'Stay focused and try again'}</h2>
          <p className="exam-desc">
            {timedOut
              ? 'The time limit ended before you completed the challenge.'
              : `You completed the challenge in ${elapsed} seconds.`}
          </p>
          <div style={{
            fontSize: 72, fontWeight: 800,
            color: passed ? 'var(--success)' : 'var(--danger)',
            marginBottom: 12
          }}>
            {score}/10
          </div>
          <p style={{ color: 'var(--muted)', marginBottom: 28 }}>
            {passed
              ? 'Good work. You answered at least 8 questions correctly within the time limit.'
              : 'You need at least 8 correct answers before time runs out.'}
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn ghost" style={{ flex: 1 }} onClick={() => { stopTimer(); setState('intro') }}>
              Back
            </button>
            <button className="btn" style={{ flex: 2 }} onClick={startExam}>Try again</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// MODULES
function ModulesPage() {
  const { dashboard, loading } = useApp()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const q = (params.get('q') || '').toLowerCase()
  const list = (dashboard?.courses ?? []).filter(c =>
    !q || `${c.title} ${c.code || ''}`.toLowerCase().includes(q)
  )

  return (
    <div className="page">
      <PageHead title="My modules" sub="Everything you are enrolled in" />
      {loading ? <Loading /> : list.length ? (
        <div className="grid c2">
          {list.map(c => (
            <button className="card" key={c.id} onClick={() => navigate(`/modules/${c.id}`)} style={{ cursor: 'pointer', textAlign: 'left' }}>
              <div className="row-icon"><BookOpen size={20} /></div>
              <h3>{c.title}</h3>
              <p>{c.description || c.code || 'Module'}</p>
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                  <span>Progress</span><strong>{pct(c)}%</strong>
                </div>
                <div style={{ height: 7, background: 'var(--line)', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ width: `${pct(c)}%`, height: '100%', background: 'var(--brand)', borderRadius: 10 }} />
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : <Empty title="No modules yet" hint="Enrolled modules will appear here." />}
    </div>
  )
}

function CourseDetailsPage() {
  const { courseId = '' } = useParams()
  const { api } = useApp()
  const navigate = useNavigate()
  const [data, setData] = useState<ApiResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    api(`/api/student/courses/${encodeURIComponent(courseId)}`)
      .then(result => { if (!cancelled) setData(result) })
      .catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [courseId, api])

  if (error) return <Empty title="Could not load module" hint={error} action={<button className="btn" onClick={() => navigate('/modules')}>Back</button>} />
  if (!data?.course) return <Loading />

  return (
    <div className="page">
      <button className="back" onClick={() => navigate('/modules')}><ArrowLeft size={16} />Modules</button>
      <PageHead title={data.course.title} sub={data.course.description || undefined} />
      {data.lessons?.length ? (
        <div className="doc-list">
          {data.lessons.map(lesson => (
            <button className="doc-card" key={lesson.id} onClick={() => navigate(`/lessons/${lesson.id}`)}>
              <div className="row-icon"><BookOpen size={20} /></div>
              <div className="row-main"><strong>{lesson.title}</strong><span>{lesson.completed ? 'Completed' : 'Not completed'}</span></div>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
      ) : <Empty title="No lessons yet" hint="Lessons for this module will appear here." />}
    </div>
  )
}

function LessonPage() {
  const { lessonId = '' } = useParams()
  const { api } = useApp()
  const navigate = useNavigate()
  const [data, setData] = useState<ApiResult | null>(null)
  const [error, setError] = useState('')
  const [completing, setCompleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    api(`/api/student/lessons/${encodeURIComponent(lessonId)}`)
      .then(result => { if (!cancelled) setData(result) })
      .catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [lessonId, api])

  const markComplete = async () => {
    setCompleting(true)
    try {
      await api(`/api/student/lessons/${encodeURIComponent(lessonId)}/complete`, { method: 'POST' })
      setData(prev => prev ? { ...prev, completed: true } : null)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not mark lesson complete.')
    } finally {
      setCompleting(false)
    }
  }

  if (error) return <Empty title="Could not load lesson" hint={error} />
  if (!data?.lesson) return <Loading />

  const isCompleted = data.completed

  return (
    <div className="page">
      <button className="back" onClick={() => navigate(`/modules/${data.lesson?.course_id}`)}>
        <ArrowLeft size={16} />Back to module
      </button>
      <PageHead 
        title={data.lesson.title} 
        right={
          isCompleted ? (
            <span className="badge success" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px' }}>
              <Award size={16} /> Completed
            </span>
          ) : (
            <button className="btn" onClick={markComplete} disabled={completing}>
              {completing ? 'Saving...' : 'Mark as Complete'}
            </button>
          )
        }
      />
      <div className="card" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
        {data.lesson.content || 'No lesson content is available yet.'}
      </div>
    </div>
  )
}

// OTHER PAGES
function TimeTablePage() {
  return (
    <div className="page">
      <PageHead title="Timetable" />
      <div className="grid c2">
        {Object.entries(TIMETABLE).map(([day, classes]) => (
          <div className="card" key={day}>
            <h3>{day}</h3>
            {classes.map(item => (
              <p key={item.t} style={{ color: 'var(--muted)', fontSize: 14 }}>
                {item.t} - {item.n} • {item.r}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function AssignmentsPage() {
  return (
    <div className="page">
      <PageHead title="Assignments" sub="Manage your pending work" />
      <div className="doc-list">
        {ASSIGNMENTS.map(a => (
          <div className="doc-card" key={a.title}>
            <div className="row-icon" style={{
              background: a.status === 'graded' ? '#E8F8F1' : '#FFF4E5',
              color: a.status === 'graded' ? '#159B70' : '#D98A28'
            }}>
              <ClipboardList size={20} />
            </div>
            <div className="row-main"><strong>{a.title}</strong><span>{a.course} • Due {rel(a.off)}</span></div>
            <span className={`badge ${a.status === 'graded' ? 'success' : 'warn'}`}>
              {a.status === 'graded' ? a.grade : 'Pending'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function UpcomingPage() {
  return (
    <div className="page">
      <PageHead title="Upcoming" sub="Your schedule for the next few days" />
      <div className="doc-list">
        {UPCOMING.map(u => (
          <div className="doc-card" key={u.title}>
            <div className="row-icon"><Clock size={20} /></div>
            <div className="row-main"><strong>{u.title}</strong><span>{u.type} • {rel(u.off)}</span></div>
          </div>
        ))}
      </div>
    </div>
  )
}

function NotificationsPage() {
  return (
    <div className="page">
      <PageHead title="Notifications" sub="Stay updated" />
      <div className="doc-list">
        {NOTIFS0.map(n => (
          <div className="doc-card" key={n.id} style={{ background: n.unread ? 'var(--brand-soft)' : 'var(--surface)' }}>
            <div className="row-icon"><Bell size={20} /></div>
            <div className="row-main"><strong>{n.title}</strong><span>{n.desc}</span></div>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{n.time}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function WorkWithMePage() {
  const tutors = [
    { name: 'Dr. Sarah Jenkins', subject: 'Mathematics', rate: '$30/hr' },
    { name: 'Prof. David Chen', subject: 'Physics', rate: '$25/hr' }
  ]

  return (
    <div className="page">
      <PageHead title="Work With Me" sub="Book 1-on-1 sessions with top tutors." />
      <div className="grid c2">
        {tutors.map(t => (
          <div className="card" key={t.name}>
            <div className="row-icon" style={{ marginBottom: 16 }}><User size={24} /></div>
            <h3>{t.name}</h3>
            <p style={{ color: 'var(--muted)', marginBottom: 16 }}>{t.subject} • {t.rate}</p>
            <button className="btn soft" style={{ width: '100%', background: 'var(--brand-soft)', border: 'none' }}>
              Request Session
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function ExplorePage() {
  const resources = [
    { title: 'Calculus Masterclass', type: 'Video', time: '45 min' },
    { title: 'Shakespeare Study Guide', type: 'PDF', time: '12 pages' },
    { title: 'Physics Formulas', type: 'Article', time: '5 min read' }
  ]

  return (
    <div className="page">
      <PageHead title="Explore" sub="Discover new resources" />
      <div className="grid c2">
        {resources.map(r => (
          <div className="card" key={r.title}>
            <div className="row-icon" style={{ marginBottom: 16 }}><Compass size={24} /></div>
            <h3>{r.title}</h3>
            <p style={{ color: 'var(--muted)' }}>{r.type} • {r.time}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function RecordsPage() {
  const { dashboard, loading } = useApp()
  const records = dashboard?.academic_records || []

  return (
    <div className="page">
      <PageHead title="Academic Records" sub="Your recorded results" />
      {loading ? <Loading /> : records.length ? (
        <div className="doc-list">
          {records.map(record => (
            <div className="doc-card" key={record.id}>
              <div className="row-icon"><FileText size={20} /></div>
              <div className="row-main">
                <strong>{record.assessment_name || 'Assessment'}</strong>
                <span>{record.recorded_at ? new Date(record.recorded_at).toLocaleDateString() : 'Recorded result'}</span>
              </div>
              <strong>{record.score ?? 0}/{record.max_score ?? 100}</strong>
            </div>
          ))}
        </div>
      ) : <Empty title="No academic records yet" hint="Your recorded results will appear here." />}
    </div>
  )
}

function AITutorPage() {
  return null
}

function ProfilePage() {
  const { user, logout } = useApp()

  return (
    <div className="page">
      <PageHead title="Profile" />
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <div className="avatar" style={{ width: 80, height: 80, fontSize: 24, margin: '0 auto 20px' }}>
          {initialsOf(user.display_name || user.email)}
        </div>
        <h2>{user.display_name || 'Student'}</h2>
        <p style={{ color: 'var(--muted)', marginBottom: 24 }}>{user.email}</p>
        <button className="btn danger" onClick={logout}>Sign Out</button>
      </div>
    </div>
  )
}

// AUTHENTICATION
type AuthFields = {
  email: string
  password: string
  name: string
  phone: string
  address: string
  institution: string
  faculty: string
  year: string
  level: string
}

function AuthScreen({
  onSubmit,
  notice
}: {
  onSubmit: (mode: 'login' | 'register', f: AuthFields) => Promise<string>
  notice: string
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [f, setF] = useState<AuthFields>({
    email: '', password: '', name: '', phone: '', address: '',
    institution: '', faculty: '', year: '', level: 'Intermediate'
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [show, setShow] = useState(false)

  const set = (k: keyof AuthFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF(p => ({ ...p, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (!f.email.trim() || !f.password) {
      setError('Enter email and password.')
      return
    }

    if (mode === 'register' && !f.name.trim()) {
      setError('Enter your full name.')
      return
    }

    setBusy(true)
    try {
      const msg = await onSubmit(mode, f)
      if (msg) setError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--background)', padding: 20 }}>
      <div className="card" style={{ width: '100%', maxWidth: 440, padding: 40 }}>
        <div className="brand" style={{ justifyContent: 'center', marginBottom: 24 }}>
          <div className="brand-icon"><GraduationCap size={22} /></div>
          <strong>Learnova</strong>
        </div>
        <h2 style={{ textAlign: 'center', marginBottom: 24 }}>
          {mode === 'login' ? 'Welcome back' : 'Create account'}
        </h2>

        {notice && <div style={{ color: 'var(--muted)', marginBottom: 16, textAlign: 'center', fontSize: 14 }}>{notice}</div>}
        {error && <div style={{ color: 'var(--danger)', marginBottom: 16, textAlign: 'center', fontSize: 14, background: '#FFF0F0', padding: 10, borderRadius: 8 }}>{error}</div>}

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {mode === 'register' && (
            <>
              <input required placeholder="Full Name" value={f.name} onChange={set('name')} style={{ padding: 14, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--background)' }} />
              <input placeholder="Phone Number (+1234567890)" value={f.phone} onChange={set('phone')} style={{ padding: 14, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--background)' }} />
              <input placeholder="Address" value={f.address} onChange={set('address')} style={{ padding: 14, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--background)' }} />
              <input placeholder="Institution" value={f.institution} onChange={set('institution')} style={{ padding: 14, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--background)' }} />
              <input placeholder="Faculty" value={f.faculty} onChange={set('faculty')} style={{ padding: 14, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--background)' }} />
              <input placeholder="Academic year" value={f.year} onChange={set('year')} style={{ padding: 14, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--background)' }} />
            </>
          )}

          <input type="email" required placeholder="Email" value={f.email} onChange={set('email')} style={{ padding: 14, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--background)' }} />

          <div style={{ position: 'relative' }}>
            <input
              required
              type={show ? 'text' : 'password'}
              placeholder="Password"
              value={f.password}
              onChange={set('password')}
              style={{ width: '100%', padding: 14, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--background)' }}
            />
            <button type="button" onClick={() => setShow(!show)} style={{ position: 'absolute', right: 14, top: 14, background: 'none', border: 'none', color: 'var(--muted)' }}>
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <button type="submit" className="btn" style={{ marginTop: 8 }} disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Register'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: 'var(--muted)' }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
            style={{ background: 'none', border: 'none', color: 'var(--brand)', fontWeight: 700, cursor: 'pointer' }}
          >
            {mode === 'login' ? 'Sign up' : 'Log in'}
          </button>
        </p>
      </div>
    </div>
  )
}

// ROOT APP
function MainApp() {
  const [accessToken, setAccessToken] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [dashboard, setDashboard] = useState<ApiResult | null>(null)
  const [dashLoading, setDashLoading] = useState(false)
  const [activeCategory, setActiveCategory] = useState('Explore')
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'ai', text: 'Hi, I am Jonathan. What would you like to learn today?' }
  ])

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const t = localStorage.getItem('learnova_theme')
      if (t === 'dark' || t === 'light') return t
    } catch { /* local storage may be unavailable */ }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  const navigate = useNavigate()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('learnova_theme', theme) } catch { /* ignore */ }
  }, [theme])

  const api = (path: string, options: RequestInit = {}) =>
    request(path, options, accessToken, sessionId)

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
    setDashboard(null)
  }

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const token = sessionStorage.getItem('learnova_access_token')
      const id = sessionStorage.getItem('learnova_session_id')

      if (!token || !id) {
        if (!cancelled) setAuthLoading(false)
        return
      }

      try {
        const result = await request('/api/auth/me', {}, token, id)
        if (cancelled) return
        if (!result.user?.id) throw new Error('Invalid session')

        setAccessToken(token)
        setSessionId(id)
        setUser(createAuthUser(result))
      } catch {
        if (!cancelled) {
          clearSession()
          setNotice('Your session expired. Please sign in again.')
        }
      } finally {
        if (!cancelled) setAuthLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [])

  async function refresh() {
    if (!accessToken || !sessionId) return
    try {
      setDashboard(await request('/api/student/dashboard', {}, accessToken, sessionId))
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    if (!user || !accessToken || !sessionId) return

    let cancelled = false
    setDashLoading(true)

    request('/api/student/dashboard', {}, accessToken, sessionId)
      .then(result => { if (!cancelled) setDashboard(result) })
      .catch(error => { if (!cancelled) console.error(error) })
      .finally(() => { if (!cancelled) setDashLoading(false) })

    return () => { cancelled = true }
  }, [user, accessToken, sessionId])

  async function handleAuth(mode: 'login' | 'register', f: AuthFields): Promise<string> {
    try {
      const body = mode === 'login'
        ? {
            email: f.email.trim(),
            password: f.password,
            deviceLabel: getDeviceLabel()
          }
        : {
            email: f.email.trim(),
            password: f.password,
            displayName: f.name.trim(),
            phoneNumber: f.phone.trim(),
            address: f.address.trim(),
            institution: f.institution.trim(),
            faculty: f.faculty.trim(),
            academicYear: f.year,
            englishLevel: f.level,
            deviceLabel: getDeviceLabel()
          }

      const result = await request(
        mode === 'login' ? '/api/auth/login' : '/api/auth/register',
        { method: 'POST', body: JSON.stringify(body) }
      ) as AuthResponse

      const token = result.session?.access_token || result.access_token
      const id = result.session?.session_id || result.session_id

      if (!token || !id) throw new Error(result.message || 'No session returned.')

      saveSession(token, id)
      setUser(createAuthUser(await request('/api/auth/me', {}, token, id)))
      setNotice('')
      navigate('/')
      return ''
    } catch (e) {
      return e instanceof Error ? e.message : 'Authentication failed.'
    }
  }

  async function logout() {
    try {
      if (accessToken && sessionId) {
        await request('/api/auth/logout', { method: 'POST' }, accessToken, sessionId)
      }
    } catch (e) {
      console.error(e)
    }

    clearSession()
    navigate('/')
    setNotice('Signed out.')
  }

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <LoaderCircle className="spin" size={32} />
      </div>
    )
  }

  if (!user) return <AuthScreen onSubmit={handleAuth} notice={notice} />

  const ctx: Ctx = {
    user,
    dashboard,
    loading: dashLoading,
    api,
    refresh,
    logout: () => { void logout() },
    theme,
    toggleTheme: () => setTheme(t => t === 'dark' ? 'light' : 'dark'),
    messages,
    setMessages,
    activeCategory,
    setActiveCategory
  }

  return (
    <AppCtx.Provider value={ctx}>
      <AppLayout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/modules" element={<ModulesPage />} />
          <Route path="/modules/:courseId" element={<CourseDetailsPage />} />
          <Route path="/lessons/:lessonId" element={<LessonPage />} />
          <Route path="/ai-tutor" element={<AITutorPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/quick-test" element={<QuickTestPage />} />
          <Route path="/wake-up" element={<WakeUpPage />} />
          <Route path="/work-with-me" element={<WorkWithMePage />} />
          <Route path="/timetable" element={<TimeTablePage />} />
          <Route path="/assignments" element={<AssignmentsPage />} />
          <Route path="/upcoming" element={<UpcomingPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/records" element={<RecordsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppLayout>
    </AppCtx.Provider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <MainApp />
    </BrowserRouter>
  )
}