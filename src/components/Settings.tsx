type KitchenSettings = {
  kdsEnabled: boolean
  delayAlertMinutes: number
  soundAlert: boolean
  autoSortOrders: boolean
}

type Props = {
  settings: KitchenSettings
  setSettings: React.Dispatch<React.SetStateAction<KitchenSettings>>
}

export default function Settings({ settings, setSettings }: Props) {
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