import { useEffect, useState } from "react";
import { OutletInfo } from "@/types/pos";
import { Store, Phone, MapPin, Percent, Save, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Outlet } from "@/types/outlet";


interface OutletSettingsProps {
  outlet: OutletInfo;
  onUpdate: (updates: Partial<OutletInfo>) => void;
}

export function OutletSettings({ outlet, onUpdate }: OutletSettingsProps) {
  const [formData, setFormData] = useState<OutletInfo>(outlet);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setFormData(outlet);
    setSaved(false);
  }, [outlet]);

  const handleSave = () => {
    const parsedTax = Number(formData.taxRate);

    onUpdate({
      name: formData.name.trim() || outlet.name,
      address: formData.address.trim() || outlet.address,
      phone: formData.phone.trim() || outlet.phone,
      taxRate: Number.isNaN(parsedTax) ? outlet.taxRate : parsedTax,
    });

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const hasChanges =
    formData.name !== outlet.name ||
    formData.address !== outlet.address ||
    formData.phone !== outlet.phone ||
    formData.taxRate !== outlet.taxRate;

  const updateField = <K extends keyof OutletInfo>(
    key: K,
    value: OutletInfo[K]
  ) => {
    setSaved(false);
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h2 className="text-2xl font-bold">Outlet Settings</h2>
        <p className="text-muted-foreground">
          Manage your restaurant information
        </p>
      </div>

      <div className="bg-card rounded-2xl p-6 border space-y-6">
        {/* Name */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium mb-2">
            <Store className="w-4 h-4 text-primary" />
            Outlet Name
          </label>
          <Input
            value={formData.name}
            onChange={e => updateField("name", e.target.value)}
            className="h-12 text-lg"
          />
        </div>

        {/* Address */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium mb-2">
            <MapPin className="w-4 h-4 text-primary" />
            Address
          </label>
          <Input
            value={formData.address}
            onChange={e => updateField("address", e.target.value)}
            className="h-12"
          />
        </div>

        {/* Phone */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium mb-2">
            <Phone className="w-4 h-4 text-primary" />
            Phone Number
          </label>
          <Input
            type="tel"
            value={formData.phone}
            onChange={e => updateField("phone", e.target.value)}
            className="h-12"
          />
        </div>

        {/* Tax */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium mb-2">
            <Percent className="w-4 h-4 text-primary" />
            Tax Rate (%)
          </label>
          <Input
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={Number.isNaN(formData.taxRate) ? "" : formData.taxRate}
            onChange={e =>
              updateField(
                "taxRate",
                e.target.value === "" ? outlet.taxRate : Number(e.target.value)
              )
            }
            className="h-12"
          />
        </div>

        {/* Save */}
        <Button
          onClick={handleSave}
          disabled={!hasChanges}
          className="w-full h-12 text-lg font-semibold gap-2"
        >
          {saved ? (
            <>
              <Check className="w-5 h-5" />
              Saved
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      {/* Preview */}
      <div className="mt-6 bg-accent/50 rounded-xl p-4">
        <p className="text-sm font-medium text-muted-foreground mb-2">
          Bill Preview
        </p>
        <div className="text-center py-3">
          <h3 className="text-lg font-bold">
            {formData.name || outlet.name}
          </h3>
          <p className="text-sm text-muted-foreground">
            {formData.address || outlet.address}
          </p>
          <p className="text-sm text-muted-foreground">
            {formData.phone || outlet.phone}
          </p>
        </div>
      </div>
    </div>
  );
}
