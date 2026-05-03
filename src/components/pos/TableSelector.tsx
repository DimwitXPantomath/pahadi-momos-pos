type TableEntry = {
  id: string
  seats: number
  status: "available" | "occupied"
}

type Props = {
  tables: TableEntry[]
  selectedTable: string | null
  setSelectedTable: (id: string | null) => void
}

export default function TableSelector({
  tables,
  selectedTable,
  setSelectedTable,
}: Props) {
  return (
    <div style={{ background: "white", borderRadius: 12, padding: "12px 16px", marginBottom: 12, border: "1px solid #e5e7eb" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>Select Table</span>
        <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#6b7280" }}>
          <span>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#16a34a", marginRight: 4 }} />
            Available
          </span>
          <span>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#dc2626", marginRight: 4 }} />
            Occupied
          </span>
        </div>
      </div>

      {/* Table grid */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {tables.map(t => (
          <button
            key={t.id}
            disabled={t.status === "occupied"}
            onClick={() => setSelectedTable(t.id === selectedTable ? null : t.id)}
            style={{
              width: 60, height: 52, borderRadius: 8, border: "1.5px solid",
              borderColor: selectedTable === t.id ? "#111" : t.status === "occupied" ? "#fecaca" : "#bbf7d0",
              background: selectedTable === t.id ? "#111" : t.status === "occupied" ? "#fef2f2" : "#f0fdf4",
              color: selectedTable === t.id ? "white" : t.status === "occupied" ? "#dc2626" : "#16a34a",
              cursor: t.status === "occupied" ? "not-allowed" : "pointer",
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: 2,
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 14 }}>{t.id}</span>
            <span style={{ fontSize: 9, opacity: 0.8 }}>{t.seats} seats</span>
          </button>
        ))}
      </div>

      {/* Selected confirmation */}
      {selectedTable && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#16a34a", fontWeight: 600 }}>
          ✓ Table {selectedTable} selected —
          <button
            onClick={() => setSelectedTable(null)}
            style={{ background: "none", border: "none", color: "#dc2626", fontSize: 12, cursor: "pointer", marginLeft: 4, fontWeight: 600 }}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  )
}
