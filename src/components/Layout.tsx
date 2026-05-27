import { useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useNavigate, useLocation } from "react-router-dom"

type NavItem = {
  label: string
  value: string
  icon: string
  roles: ("owner" | "manager" | "staff")[]
}

const NAV_ITEMS: NavItem[] = [
  { label: "Menu",            value: "menu",        icon: "🍽️",  roles: ["owner","manager","staff"] },
  { label: "Orders",          value: "orders",      icon: "🧾",  roles: ["owner","manager","staff"] },
  { label: "Order History",   value: "history",     icon: "📋",  roles: ["owner","manager"] },
  { label: "Menu Management", value: "menu_manage", icon: "✏️",  roles: ["owner","manager"] },
  { label: "Sub Recipes",     value: "subrecipes",  icon: "🥣",  roles: ["owner","manager"] },
  { label: "Recipes",         value: "recipes",     icon: "📖",  roles: ["owner","manager"] },
  { label: "Production",      value: "production",  icon: "🍳",  roles: ["owner","manager"] },
  { label: "Procurement",     value: "procurement", icon: "🛒",  roles: ["owner","manager"] },
  { label: "Analytics",       value: "analytics",   icon: "📊",  roles: ["owner"] },
  { label: "Loyalty Points",  value: "loyalty",     icon: "⭐",  roles: ["owner", "manager"] },
  { label: "Reports",         value: "reports",     icon: "📤",  roles: ["owner"] },
  { label: "Settings",        value: "settings",    icon: "⚙️",  roles: ["owner"] },
  { label: "Inventory",      value: "inventory", icon: "📦", roles: ["owner","manager"] },
  { label: "Expenses / P&L", value: "expenses",  icon: "💸", roles: ["owner"] },
]

type Props = {
  view: string
  setView: (v: string) => void
  todayOrderCount: number
}

export default function Layout({ view, setView, todayOrderCount }: Props) {
  const [open, setOpen] = useState(false)
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  const visibleItems = NAV_ITEMS.filter(item =>
    profile?.role ? item.roles.includes(profile.role) : true
  )

  const handleNav = (value: string) => {
    setView(value)
    setOpen(false)
  }

  const handleSignOut = async () => {
    await signOut()
    navigate("/login")
  }

  const roleLabel = {
    owner: "Owner",
    manager: "Manager",
    staff: "Staff",
  }[profile?.role ?? "staff"]

  return (
    <>
      {/* Top header bar */}
      <header style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            onClick={() => setOpen(true)}
            style={styles.hamburger}
            aria-label="Open menu"
          >
            <span style={styles.hamburgerLine} />
            <span style={styles.hamburgerLine} />
            <span style={styles.hamburgerLine} />
          </button>

          {/* Home button — always visible, one tap to go to menu */}
          {view !== "menu" && (
            <button
              onClick={() => { setView("menu"); setOpen(false) }}
              style={{
                background: "#f3f4f6",
                border: "none",
                borderRadius: 8,
                padding: "6px 10px",
                cursor: "pointer",
                fontSize: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label="Go to menu"
              title="Back to Menu"
            >🏠</button>
          )}
        </div>

        <div style={styles.headerBrand}>
          <span style={{ fontSize: 18 }}>🌿</span>
          <span style={styles.headerTitle}>Praang</span>
          {view !== "menu" && (
            <span style={styles.headerView}>
              {NAV_ITEMS.find(i => i.value === view)?.label}
            </span>
          )}
        </div>

        <div style={styles.headerRight}>
          <div style={styles.orderBadge}>
            <span style={{ fontSize: 14 }}>🧾</span>
            <span style={styles.orderCount}>{todayOrderCount}</span>
          </div>
        </div>
      </header>

      {/* Overlay */}
      <div
        className={`sidebar-overlay ${open ? "open" : ""}`}
        onClick={() => setOpen(false)}
      />

      {/* Sliding sidebar */}
      <aside style={{
        ...styles.sidebar,
        transform: open ? "translateX(0)" : "translateX(-100%)",
      }}>

        {/* Sidebar header */}
        <div style={styles.sidebarHeader}>
          <div>
            <div style={styles.sidebarBrand}>
              <span style={{ fontSize: 22 }}>🌿</span>
              <span style={styles.sidebarTitle}>Praang</span>
            </div>
            <div style={styles.sidebarRole}>{roleLabel} · {profile?.name || "User"}</div>
          </div>
          <button onClick={() => setOpen(false)} style={styles.closeBtn}>✕</button>
        </div>

        {/* Today's orders pill */}
        <div style={styles.statPill}>
          <span>Today's orders</span>
          <span style={styles.statNumber}>{todayOrderCount}</span>
        </div>

        {/* Nav items */}
        <nav style={styles.nav}>
          {visibleItems.map(item => (
            <button
              key={item.value}
              onClick={() => handleNav(item.value)}
              style={{
                ...styles.navItem,
                background: view === item.value ? "#f97316" : "transparent",
                color: view === item.value ? "white" : "rgba(255,255,255,0.8)",
                fontWeight: view === item.value ? 700 : 400,
              }}
            >
              <span style={{ fontSize: 18, width: 24 }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Sign out */}
        <button onClick={handleSignOut} style={styles.signOutBtn}>
          <span>🚪</span>
          <span>Sign out</span>
        </button>

      </aside>
    </>
  )
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    height: 56,
    background: "white",
    borderBottom: "1px solid #e5e7eb",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 16px",
    zIndex: 30,
  },
  hamburger: {
    background: "none",
    border: "none",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: 5,
    padding: 6,
  },
  hamburgerLine: {
    display: "block",
    width: 22,
    height: 2,
    background: "#111",
    borderRadius: 2,
  },
  headerBrand: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    position: "absolute",
    left: "50%",
    transform: "translateX(-50%)",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 800,
    letterSpacing: "-0.5px",
    color: "#111",
  },
  headerView: {
    fontSize: 13,
    color: "#6b7280",
    marginLeft: 4,
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  orderBadge: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    background: "#f3f4f6",
    borderRadius: 20,
    padding: "4px 10px",
  },
  orderCount: {
    fontWeight: 700,
    fontSize: 14,
    color: "#111",
  },
  sidebar: {
    position: "fixed",
    top: 0,
    left: 0,
    bottom: 0,
    width: 280,
    background: "#111",
    zIndex: 50,
    display: "flex",
    flexDirection: "column",
    transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    overflowY: "auto",
  },
  sidebarHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "24px 20px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
  },
  sidebarBrand: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  sidebarTitle: {
    fontSize: 22,
    fontWeight: 800,
    color: "white",
    letterSpacing: "-0.5px",
  },
  sidebarRole: {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.5)",
    fontSize: 18,
    cursor: "pointer",
    padding: 4,
    marginTop: 2,
  },
  statPill: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    margin: "16px",
    background: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
  },
  statNumber: {
    fontWeight: 800,
    fontSize: 20,
    color: "white",
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "8px 12px",
    flex: 1,
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontSize: 14,
    textAlign: "left",
    transition: "background 0.15s",
  },
  signOutBtn: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    margin: "12px 16px 24px",
    padding: "10px 14px",
    background: "rgba(255,255,255,0.08)",
    border: "none",
    borderRadius: 8,
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    cursor: "pointer",
  },
}