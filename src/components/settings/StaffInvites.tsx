import { useState } from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { useInvites } from "@/hooks/useInvites"

// Owner/manager-only screen for the invite-only signup gate
// (028_invite_only_signup.sql). Mounted as a new "Staff" nav item —
// see Layout.tsx / Index.tsx. New file, doesn't touch anything
// existing.

function inviteStatus(inv: { used_at: string | null; expires_at: string }) {
  if (inv.used_at) return { label: "Used", variant: "success" as const }
  if (new Date(inv.expires_at) < new Date()) return { label: "Expired", variant: "gray" as const }
  return { label: "Pending", variant: "warning" as const }
}

export default function StaffInvites() {
  const { invites, loading, error, inviteGeneral, inviteStaff } = useInvites()

  const [generalEmail, setGeneralEmail] = useState("")
  const [generalSubmitting, setGeneralSubmitting] = useState(false)
  const [generalMsg, setGeneralMsg] = useState<string | null>(null)
  const [generalErr, setGeneralErr] = useState<string | null>(null)

  const [staffName, setStaffName] = useState("")
  const [staffEmail, setStaffEmail] = useState("")
  const [staffPhone, setStaffPhone] = useState("")
  const [staffSubmitting, setStaffSubmitting] = useState(false)
  const [staffErr, setStaffErr] = useState<string | null>(null)
  const [lastCode, setLastCode] = useState<{ name: string; email: string; code: string } | null>(null)

  const submitGeneral = async (e: React.FormEvent) => {
    e.preventDefault()
    setGeneralErr(null)
    setGeneralMsg(null)
    if (!generalEmail.trim()) return
    setGeneralSubmitting(true)
    const res = await inviteGeneral(generalEmail)
    setGeneralSubmitting(false)
    if (!res.ok) { setGeneralErr(res.error || "Could not create invite"); return }
    setGeneralMsg(`Invited ${generalEmail}. They can now sign up at /login.`)
    setGeneralEmail("")
  }

  const submitStaff = async (e: React.FormEvent) => {
    e.preventDefault()
    setStaffErr(null)
    setLastCode(null)
    if (!staffName.trim() || !staffEmail.trim()) { setStaffErr("Name and email are required."); return }
    setStaffSubmitting(true)
    const res = await inviteStaff({ name: staffName, email: staffEmail, phone: staffPhone })
    setStaffSubmitting(false)
    if (!res.ok || !res.code) { setStaffErr(res.error || "Could not create invite"); return }
    setLastCode({ name: staffName, email: staffEmail, code: res.code })
    setStaffName("")
    setStaffEmail("")
    setStaffPhone("")
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div>
        <h2 className="text-xl font-bold text-foreground m-0">Staff & Invites</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Sign-up is invite-only. Nobody can create an account unless you invite their email here first.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add staff</CardTitle>
          <CardDescription>
            Generates a one-time code. Share it with them yourself (WhatsApp, in person, etc.) along with the
            activation link — there's no automatic SMS. They'll also need to confirm their email to finish.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitStaff} className="flex flex-col gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Name</Label>
                <Input value={staffName} onChange={e => setStaffName(e.target.value)} placeholder="e.g. Priya Verma" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Email</Label>
                <Input type="email" value={staffEmail} onChange={e => setStaffEmail(e.target.value)} placeholder="staff@example.com" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Phone (optional)</Label>
                <Input value={staffPhone} onChange={e => setStaffPhone(e.target.value)} placeholder="For records only" />
              </div>
            </div>
            {staffErr && <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg px-3 py-2">{staffErr}</div>}
            <div>
              <Button type="submit" disabled={staffSubmitting}>{staffSubmitting ? "Creating…" : "Generate staff code"}</Button>
            </div>
          </form>

          {lastCode && (
            <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <p className="text-sm text-foreground m-0 mb-2">
                Code for <strong>{lastCode.name}</strong> ({lastCode.email}):
              </p>
              <p className="font-mono text-2xl font-bold tracking-widest text-primary m-0 mb-2">{lastCode.code}</p>
              <p className="text-xs text-muted-foreground m-0">
                Send them this code and tell them to go to <strong>/staff-activate</strong>, enter this code with the
                same email, choose a password, then confirm the email that gets sent to them. Expires in 7 days.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invite a colleague</CardTitle>
          <CardDescription>For someone who should use the regular sign-up page (no code needed) — just their email.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitGeneral} className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex flex-col gap-1.5 flex-1">
              <Label>Email</Label>
              <Input type="email" value={generalEmail} onChange={e => setGeneralEmail(e.target.value)} placeholder="colleague@example.com" />
            </div>
            <Button type="submit" disabled={generalSubmitting}>{generalSubmitting ? "Inviting…" : "Send invite"}</Button>
          </form>
          {generalErr && <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg px-3 py-2 mt-3">{generalErr}</div>}
          {generalMsg && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-3 py-2 mt-3">{generalMsg}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All invites</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invites yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map(inv => {
                  const status = inviteStatus(inv)
                  return (
                    <TableRow key={inv.id}>
                      <TableCell>{inv.email}</TableCell>
                      <TableCell className="capitalize">{inv.purpose}</TableCell>
                      <TableCell>{inv.name || "—"}</TableCell>
                      <TableCell><Badge variant={status.variant}>{status.label}</Badge></TableCell>
                      <TableCell>{new Date(inv.created_at).toLocaleDateString("en-IN")}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
