type Printer = {
  id: string
  name: string
  role: "BILL" | "KOT" | "BOTH"
}

type POSSettings = {
  kdsEnabled: boolean
  delayAlertMinutes: number
  soundAlert: boolean
  autoSortOrders: boolean
  printers: Printer[]
}

type Props = {
  settings: POSSettings
  setSettings: React.Dispatch<React.SetStateAction<POSSettings>>
}

export default function Settings({ settings, setSettings }: Props) {
  const updatePrinterRole = (id: string, role: string) => {

  const updated = settings.printers.map((p:any) =>
    p.id === id ? { ...p, role } : p
  )

  setSettings({
    ...settings,
    printers: updated
  })
}

  return (
    <div>

      <h2 className="text-2xl font-bold mb-6">Settings</h2>

      {/* KDS Toggle */}
      <div className="mb-4">
        <label>
          <input
            type="checkbox"
            checked={settings.kdsEnabled}
            onChange={(e) =>
              setSettings({
                ...settings,
                kdsEnabled: e.target.checked
              })
            }
          />
          Enable Kitchen Display
        </label>
      </div>

      {/* Printer Setup */}
      <h3 className="font-bold mt-6 mb-2">
        Printer Setup
      </h3>

      {settings.printers?.map((printer:any) => (

        <div
          key={printer.id}
          className="flex items-center justify-between mb-3"
        >

          <span>{printer.name}</span>

          <select
            value={printer.role}
            onChange={(e) =>
              updatePrinterRole(printer.id, e.target.value)
            }
            className="border rounded p-1"
          >
            <option value="BILL">Bill Printer</option>
            <option value="KOT">Kitchen Printer</option>
            <option value="BOTH">Both</option>
          </select>

        </div>

      ))}

      {/* Delay Alert */}
      <div className="mb-4">
        <label>Delay Alert (minutes)</label>

        <input
          type="number"
          value={settings.delayAlertMinutes}
          onChange={(e) =>
            setSettings({
              ...settings,
              delayAlertMinutes: Number(e.target.value)
            })
          }
          className="border p-2 ml-2"
        />
      </div>

      {/* Sound Alert */}
      <div className="mb-4">
        <label>
          <input
            type="checkbox"
            checked={settings.soundAlert}
            onChange={(e) =>
              setSettings({
                ...settings,
                soundAlert: e.target.checked
              })
            }
          />
          Enable Sound Alert
        </label>
      </div>

      <h3>Display Settings</h3>

      {/* Token Display */}
      <div style={{ marginTop: 20 }}>
        <label>
          <input
            type="checkbox"
            checked={settings.customerDisplayEnabled}
            onChange={(e) =>
              setSettings(prev => ({
                ...prev,
                customerDisplayEnabled: e.target.checked
              }))
            }
          />
          Enable Customer Display Screen
        </label>
      </div>

      {/* Auto Sort */}
      <div>
        <label>
          <input
            type="checkbox"
            checked={settings.autoSortOrders}
            onChange={(e) =>
              setSettings({
                ...settings,
                autoSortOrders: e.target.checked
              })
            }
          />
          Auto Sort Kitchen Orders
        </label>
      </div>

    </div>
  )
}