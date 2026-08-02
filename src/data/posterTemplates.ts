// Poster content below is common good-practice kitchen/hygiene guidance,
// written for clarity — it is NOT a verbatim reproduction of FSSAI's legal
// Food Safety Display Board text or Schedule 4 requirements. Outlets that
// need the exact mandated wording for their license type should confirm it
// against their FSSAI license documentation before treating these as a
// compliance substitute.

export type PosterTemplate = {
  id: string
  title: string
  subtitle: string
  icon: string
  sections: { heading: string; items: string[] }[]
}

export const POSTER_TEMPLATES: PosterTemplate[] = [
  {
    id: "hygiene-rules",
    title: "Kitchen Hygiene Rules",
    subtitle: "Display near the prep area",
    icon: "🧼",
    sections: [
      {
        heading: "Before you start work",
        items: [
          "Wash hands thoroughly with soap for at least 20 seconds",
          "Tie back hair and wear a cap or hairnet",
          "Wear a clean apron — change if visibly soiled",
          "Remove jewellery from hands and wrists",
          "Report any cuts, illness, or infection to your supervisor",
        ],
      },
      {
        heading: "While working",
        items: [
          "Use separate cutting boards for raw meat, vegetables, and ready-to-eat food",
          "Never taste food with the same spoon twice without washing it",
          "Keep raw and cooked food stored separately",
          "Wipe down surfaces between tasks",
          "Cover cuts and wounds with a waterproof dressing",
        ],
      },
      {
        heading: "Cleanliness",
        items: [
          "Clean as you go — don't let mess pile up",
          "Dispose of waste in covered bins, empty regularly",
          "Sanitize surfaces after handling raw ingredients",
        ],
      },
    ],
  },
  {
    id: "dos-donts",
    title: "Do's & Don'ts for Food Handlers",
    subtitle: "Display in the staff area",
    icon: "✅",
    sections: [
      {
        heading: "Do's",
        items: [
          "Do wash your hands before handling food and after every break",
          "Do wear clean uniform and closed footwear",
          "Do store food at the correct temperature",
          "Do label and date food that's prepped in advance",
          "Do inform your supervisor if you feel unwell",
        ],
      },
      {
        heading: "Don'ts",
        items: [
          "Don't handle food if you have vomiting, diarrhoea, or an open wound on your hands",
          "Don't smoke, eat, or chew gum in the food prep area",
          "Don't use the same gloves for raw and ready-to-eat food",
          "Don't leave perishable food out at room temperature",
          "Don't ignore expired or spoiled ingredients — discard them",
        ],
      },
    ],
  },
  {
    id: "handwashing-steps",
    title: "How to Wash Your Hands",
    subtitle: "Display above the handwash sink",
    icon: "🧴",
    sections: [
      {
        heading: "7 steps",
        items: [
          "1. Wet hands with clean running water",
          "2. Apply enough soap to cover all hand surfaces",
          "3. Rub palms together",
          "4. Rub back of each hand with the palm of the other",
          "5. Interlace fingers and rub between them",
          "6. Rinse thoroughly under running water",
          "7. Dry with a single-use towel or air dryer",
        ],
      },
      {
        heading: "Wash your hands",
        items: [
          "Before starting work and after every break",
          "After using the restroom",
          "After handling raw food",
          "After touching your face, hair, or phone",
          "After handling waste or cleaning chemicals",
        ],
      },
    ],
  },
  {
    id: "food-safety-reminders",
    title: "Food Safety Reminders",
    subtitle: "General display board",
    icon: "🛡️",
    sections: [
      {
        heading: "Temperature",
        items: [
          "Keep hot food above 60°C",
          "Keep cold food below 5°C",
          "Reheat food to at least 75°C before serving",
          "Never refreeze thawed food",
        ],
      },
      {
        heading: "Storage",
        items: [
          "First In, First Out — use older stock first",
          "Store raw meat below ready-to-eat food in the fridge",
          "Keep chemicals and cleaning supplies away from food storage",
        ],
      },
      {
        heading: "For customers",
        items: [
          "We follow FSSAI food safety guidelines",
          "Feedback or concerns — please speak to our manager",
        ],
      },
    ],
  },
]
