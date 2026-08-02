// Curated "how to apply" resource list for new food business owners.
// Deliberately informational only — official links + procedural steps, no
// fillable legal documents. See docs/business-documents-checklist.md for why
// that line matters.
//
// `officialUrl: null` means the correct portal is state/municipal-specific
// and varies enough that hardcoding a guessed URL would be worse than not
// having one — `verifyNote` tells the owner what to search for instead.
// Everything with a real officialUrl below was confirmed against a live
// search in August 2026; government portals do move, so if a link 404s,
// that's worth flagging back rather than assumed still-broken forever.

export type ResourceCategory = "registration" | "food_license" | "tax" | "labour" | "ip" | "local"

export interface BusinessResource {
  id: string
  category: ResourceCategory
  name: string
  description: string
  appliesWhen: string
  officialUrl: string | null
  verifyNote?: string
  steps: string[]
  timeline?: string
}

export const CATEGORY_LABELS: Record<ResourceCategory, string> = {
  registration: "🏢 Business Registration",
  food_license: "🍽️ Food-Specific Licenses",
  tax: "💰 Tax & Financial",
  labour: "👥 Labour & HR Compliance",
  ip: "™️ Brand Protection",
  local: "🏛️ Local & Municipal",
}

export const BUSINESS_RESOURCES: BusinessResource[] = [
  {
    id: "fssai",
    category: "food_license",
    name: "FSSAI Registration / License",
    description: "Mandatory for every food business in India. Tiered by annual turnover — get the tier wrong and you'll have to re-apply.",
    appliesWhen: "Basic Registration: turnover under ₹12 lakh/year · State License: ₹12 lakh–₹20 crore/year · Central License: above ₹20 crore/year, or any import/export",
    officialUrl: "https://foscos.fssai.gov.in/apply-for-lic-and-reg",
    steps: [
      "Confirm your turnover tier (Basic / State / Central) before starting the form",
      "Register on FoSCoS (Food Safety Compliance System) — this replaced the old FLRS portal",
      "Upload premises photos, ID proof, and a layout plan",
      "Pay the tier-appropriate fee",
      "License is typically valid 1–5 years — set a renewal reminder before it lapses",
    ],
    timeline: "Basic: 7–15 days · State/Central: 30–60 days",
  },
  {
    id: "gst",
    category: "tax",
    name: "GST Registration",
    description: "Required once turnover crosses the threshold — and mandatory from day one if you list on Swiggy/Zomato or any e-commerce platform, regardless of turnover.",
    appliesWhen: "Turnover above ₹20 lakh/year (₹10 lakh in some special-category states) · OR any e-commerce/delivery platform listing",
    officialUrl: "https://www.gst.gov.in/",
    steps: [
      "Go to Services → Registration → New Registration",
      "PAN, business address proof, and bank account details required",
      "Choose Composition Scheme (lower tax, no input credit) vs Regular Scheme based on your accountant's advice",
      "ARN (Application Reference Number) issued immediately; GSTIN follows after verification",
    ],
    timeline: "3–7 working days",
  },
  {
    id: "udyam",
    category: "registration",
    name: "Udyam (MSME) Registration",
    description: "Optional, but unlocks collateral-free loans, subsidy schemes, and delayed-payment protection when dealing with larger buyers or platforms.",
    appliesWhen: "Any small/medium food business — free to register",
    officialUrl: "https://udyamregistration.gov.in/",
    steps: [
      "Aadhaar of the proprietor/partner/director required",
      "PAN and GSTIN auto-fetched where already registered",
      "Self-declared investment and turnover figures — no documents to upload",
    ],
    timeline: "Same day",
  },
  {
    id: "trademark",
    category: "ip",
    name: "Trademark Registration",
    description: "FSSAI registration does NOT give you brand ownership. Without a registered trademark, you can't legally stop a copycat — or a former franchisee — from using your name.",
    appliesWhen: "Before franchising, or as soon as the brand name matters to you",
    officialUrl: "https://ipindiaonline.gov.in/trademarkefiling/",
    steps: [
      "Search the existing trademark database first (same portal) to check the name/logo is free",
      "File under the correct class — food products are typically Class 29, 30, or 31; restaurant services are Class 43",
      "Use the e-filing portal directly or through a registered trademark agent",
      "Registration takes months, but you get 'TM' usage rights from the day you file",
    ],
    timeline: "8–18 months for full registration; provisional protection starts at filing",
  },
  {
    id: "epfo",
    category: "labour",
    name: "EPFO / Provident Fund Registration",
    description: "Mandatory once headcount reaches 20 employees — register within 30 days of crossing the threshold or you're already in violation.",
    appliesWhen: "20 or more employees (smaller businesses can opt in voluntarily)",
    officialUrl: "https://unifiedportal-emp.epfindia.gov.in/",
    steps: [
      "Register the establishment on the EPFO Unified Portal (Employer)",
      "Add employees with UAN (Universal Account Number) — most employees will already have one from a previous job",
      "Monthly contribution: 12% employer + 12% employee",
    ],
    timeline: "Register within 30 days of crossing 20 employees",
  },
  {
    id: "esic",
    category: "labour",
    name: "ESIC / Employee State Insurance",
    description: "Mandatory once headcount reaches 10 employees, for staff earning up to ₹21,000/month.",
    appliesWhen: "10 or more employees, most sectors including restaurants/hotels",
    officialUrl: "https://www.esic.gov.in/",
    steps: [
      "Register the establishment on the ESIC employer portal",
      "Enroll eligible employees (wage ceiling ₹21,000/month)",
      "Monthly contribution: 3.25% employer + 0.75% employee",
    ],
    timeline: "Register within 15 days of crossing 10 employees",
  },
  {
    id: "shops_establishment",
    category: "local",
    name: "Shops & Establishments Act Registration",
    description: "Baseline registration for any commercial premises with employees — required before you can legally issue appointment letters or claim Shop & Establishment protections.",
    appliesWhen: "Every commercial food outlet with staff",
    officialUrl: null,
    verifyNote: "State-administered — for Madhya Pradesh, search \"MP e-Nagarpalika Shop and Establishment registration\" (routed through the state's municipal single-window portal). Confirm the current URL locally rather than trusting a hardcoded one — state portals get restructured.",
    steps: [
      "Apply through the state labour department or municipal single-window portal",
      "Premises address proof + employee count declaration",
      "Renew per the state's cycle (varies — often annual)",
    ],
  },
  {
    id: "trade_license",
    category: "local",
    name: "Trade License (Municipal Corporation)",
    description: "Permit from the local municipal body to operate a specific trade/business at a commercial premises — separate from Shop & Establishment registration.",
    appliesWhen: "Every commercial food outlet",
    officialUrl: null,
    verifyNote: "Issued by your local Municipal Corporation (for Bhopal: Bhopal Municipal Corporation, governed by the MP Municipal Corporation Act 1956). Search \"MP e-Nagarpalika trade license\" for the current online application route.",
    steps: [
      "Apply through the municipal corporation's single-window portal",
      "Typical timeline: 30 days from business commencement",
      "Renew annually in most municipalities",
    ],
  },
  {
    id: "fire_noc",
    category: "local",
    name: "Fire Safety NOC",
    description: "No Objection Certificate from the local fire department — mandatory for any commercial kitchen, and one of the first things inspectors check.",
    appliesWhen: "Every commercial kitchen/restaurant",
    officialUrl: null,
    verifyNote: "Issued by the state/municipal Fire Department — application process and portal vary by city. Search \"[your city] fire NOC restaurant\" for the local process.",
    steps: [
      "Fire safety equipment installed per local fire code (extinguishers, exits, alarms)",
      "Inspection by the local fire department",
      "NOC issued and must be renewed periodically",
    ],
  },
  {
    id: "music_license",
    category: "ip",
    name: "Music License (playing recorded music)",
    description: "Legally required if you play recorded music in the outlet — frequently ignored, but actively enforced through infringement notices.",
    appliesWhen: "Any outlet playing music for customers — background music, live DJ sets, etc.",
    officialUrl: "https://www.pplindia.org/",
    verifyNote: "PPL covers sound recording rights; IPRS (iprs.org) separately covers the underlying composition/lyrics — most commercial venues need both.",
    steps: [
      "Apply for a public performance license through PPL India",
      "Apply separately through IPRS for composition rights",
      "License fee is typically based on venue size/capacity",
    ],
  },
  {
    id: "liquor_license",
    category: "local",
    name: "Liquor License",
    description: "Only relevant if serving alcohol — separate application to the state excise department, and a materially longer process than the food licenses above.",
    appliesWhen: "Only if serving alcohol",
    officialUrl: null,
    verifyNote: "Issued by the state Excise Department — Madhya Pradesh Excise Department for Bhopal. Search \"Madhya Pradesh excise department liquor license\" for the current process; this one is worth engaging a local consultant for given the complexity.",
    steps: [
      "Category depends on venue type (restaurant bar, standalone bar, banquet, etc.)",
      "State excise department application, typically with police verification",
      "Significantly longer and more document-heavy than food licenses",
    ],
  },
]
