// All landing page copy and data. Statuses must stay truthful: move an item to "Working" only after it runs.

export type Status = "Working" | "Testing" | "Next";
export type Mark = "yes" | "part" | "no" | "unknown";

export const NAV_LINKS = [
  ["Film", "#film"],
  ["Problem", "#problem"],
  ["Approach", "#approach"],
  ["Features", "#features"],
  ["Stack", "#stack"],
  ["Compare", "#compare"],
  ["Team", "#team"],
] as const;

export const HERO_SLIDES = [
  { src: "/landing/hero-lounge.webp", label: "Sun lounge", alt: "A bright lounge with striped armchairs, a sofa, a chandelier and a wood stove" },
  { src: "/landing/hero-suite.webp", label: "Hotel suite", alt: "A white bed framed by dark wood cabinets and pendant lights" },
  { src: "/landing/hero-kitchen.webp", label: "Kitchen", alt: "A pale wood kitchen with open shelves and pendant lamps" },
  { src: "/landing/hero-reading.webp", label: "Reading room", alt: "Leather armchairs on a terrazzo floor beside tall arched doors" },
];

export const STATS = [
  { value: "62%", text: "of furniture shoppers find it hard to picture how a piece will look at home.", ref: 1 },
  { value: "60%", text: "say they have bought furniture online that turned out to be the wrong size.", ref: 2 },
  { value: "19–23%", text: "is the reported return rate for furniture bought online.", ref: 3 },
];

export const STAT_SOURCES = [
  { label: "3D Cloud / Provoke Insights survey, Furniture Today", href: "https://www.furnituretoday.com/technology/3d-cloud-release-study-linking-3d-visualization-and-customer-satisfaction" },
  { label: "Interiors Monthly", href: "https://interiorsmonthly.co.uk/shoppers-expect-furniture-stores-to-pay-for-buy-try-return/" },
  { label: "Eightx 2025 benchmark", href: "https://eightx.co/blog/average-furniture-and-home-return-rate-benchmarks" },
];

export const STEPS = [
  { title: "Start with the real piece", body: "Paste a listing or type the size from it. You confirm width, depth and height. Anything missing stays missing until you fill it in.", image: "/landing/photo-living.webp", alt: "A bright living room with a blue sofa and a parquet floor" },
  { title: "Show us the room", body: "Take a few overlapping photos or one short video. Blurry, dark and duplicate shots get flagged with a specific retake.", image: "/landing/photo-bedroom.webp", alt: "A sunlit bedroom with sheer curtains" },
  { title: "Set the true scale", body: "Your measurements build the floor, walls and obstacles. Turning your own photos straight into geometry is what we are building next.", image: "/landing/photo-table.webp", alt: "A long dining table with white chairs in a bright room" },
  { title: "Move it until it works", body: "Drag and rotate pieces held to their true size. See what they overlap and how much room is left, then keep the layout that works.", image: "/landing/photo-warm.webp", alt: "A bed framed by warm wooden panels and a sheer curtain" },
];

export const FEATURES: { icon: "ruler" | "move" | "gauge" | "compass" | "layers" | "shield"; title: string; body: string; status: Status }[] = [
  { icon: "ruler", title: "True to size", body: "Every piece keeps its real width, depth and height however you move it.", status: "Working" },
  { icon: "move", title: "Move, turn, add, remove", body: "Direct control by touch or mouse, in the browser, with no model call for each drag.", status: "Working" },
  { icon: "gauge", title: "Numbers on every piece", body: "Tap anything to see its floor share, nearest wall, and how much clear space it leaves in front.", status: "Working" },
  { icon: "compass", title: "An architect's checks", body: "Routes, seating distances and bed access reviewed against common planning rules.", status: "Working" },
  { icon: "layers", title: "Room, model and plan", body: "Stand in a photographed room, orbit it, then pull back to the whole apartment or look straight down.", status: "Working" },
  { icon: "shield", title: "Private by default", body: "Location data is stripped from photos, sessions are isolated, and one tap deletes everything.", status: "Working" },
];

export const ROADMAP: { title: string; body: string; status: Status }[] = [
  { title: "AI architect", body: "Muse Spark reads the measured layout and writes advice in an architect's voice.", status: "Testing" },
  { title: "Reading any listing", body: "A pasted link becomes a confirmed size. Manual entry already works; shops are being tested.", status: "Testing" },
  { title: "Style previews", body: "Ask for a look and see the current view restyled by Muse Image. Decoration only.", status: "Testing" },
  { title: "Your photos to 3D", body: "VGGT recovers cameras and depth, so walls and floor come from your own room.", status: "Next" },
  { title: "Object segmentation", body: "SAM picks out the furniture and obstacles already standing in your photos.", status: "Next" },
];

export interface Tech { name: string; icon?: "react" | "typescript" | "vite" | "three" | "python" | "fastapi" | "postgres" | "docker" | "blender" | "meta" | "supabase" | "render"; mono?: string }

export const STACK_ROWS: Tech[][] = [
  [
    { name: "Muse Spark", icon: "meta" },
    { name: "Muse Image", icon: "meta" },
    { name: "SAM 3.1", icon: "meta" },
    { name: "VGGT", mono: "Vg" },
    { name: "Baseten", mono: "Ba" },
    { name: "Modal", mono: "Mo" },
    { name: "Blender", icon: "blender" },
    { name: "trimesh", mono: "Tm" },
    { name: "Poly Haven", mono: "PH" },
  ],
  [
    { name: "React", icon: "react" },
    { name: "TypeScript", icon: "typescript" },
    { name: "Three.js", icon: "three" },
    { name: "Vite", icon: "vite" },
    { name: "Python", icon: "python" },
    { name: "FastAPI", icon: "fastapi" },
    { name: "PostgreSQL", icon: "postgres" },
    { name: "Supabase", icon: "supabase" },
    { name: "Docker", icon: "docker" },
    { name: "Render", icon: "render" },
  ],
];

export const COMPARE_COLUMNS = ["Any listing", "Your real room", "True product size", "Move it in 3D", "Overlap and clearance", "Stand inside the room", "Layout advice", "Phone browser"];

export const COMPARE_ROWS: { name: string; detail: string; refs: number[]; marks: Mark[]; us?: boolean }[] = [
  { name: "Roomset", detail: "Real furniture at its true size, in your space", refs: [], marks: ["yes", "part", "yes", "yes", "yes", "part", "part", "yes"], us: true },
  { name: "IKEA Kreativ", detail: "Scan a room, place IKEA furniture", refs: [1, 2], marks: ["no", "yes", "yes", "yes", "unknown", "unknown", "unknown", "part"] },
  { name: "Wayfair View in Room", detail: "AR and room photos for its own range", refs: [3, 4], marks: ["no", "yes", "yes", "yes", "unknown", "no", "unknown", "part"] },
  { name: "Planner 5D", detail: "Measurement-first floor planning", refs: [5], marks: ["no", "no", "yes", "yes", "part", "unknown", "unknown", "yes"] },
  { name: "RoomGPT", detail: "One photo, generated restyles", refs: [6], marks: ["no", "yes", "no", "no", "no", "no", "no", "yes"] },
];

export const COMPARE_REFS = [
  { label: "IKEA: scanning a room in Kreativ", href: "https://www.ikea.com/gb/en/customer-service/knowledge/articles/250fg37g-2498-40gg-916c-f27d354683f0.html" },
  { label: "Pickr: IKEA Kreativ", href: "https://www.pickr.com.au/news/2024/ikea-takes-augmented-reality-to-2-0-with-kreativ-ai/" },
  { label: "About Wayfair: augmented reality", href: "https://aboutwayfair.com/augmented-reality-with-a-purpose" },
  { label: "Engadget: Wayfair AR and 3D tools", href: "https://www.engadget.com/2019/11/14/wayfair-shopping-app-ar/" },
  { label: "Krea: AI interior tools compared", href: "https://www.krea.ai/blog/8-best-ai-interior-design-tools-in-2026-compared" },
  { label: "Toolradar: RoomGPT", href: "https://toolradar.com/tools/roomgpt" },
];

export const TEAM = [
  {
    name: "Long Quan Ton",
    role: "AI and 3D engineering",
    focus: "Photo analysis, reconstruction, geometry and the 3D studio.",
    photo: "/team/quan.jpg",
    links: [["GitHub", "https://github.com/BennedictQuanTon"], ["LinkedIn", "https://linkedin.com/in/bennedictquanton"]],
  },
  {
    name: "Khanh Tuong Huynh",
    role: "Software engineering",
    focus: "Product flow, backend, hosting and submission.",
    photo: "/team/tuong.jpg",
    links: [["GitHub", "https://github.com/khanhtuongnakitomo"]],
  },
];

export const CREDITS = "Rooms and furniture: Poly Haven, CC0. Interior photographs: StockSnap, CC0. Furniture is rendered into the room photographs.";
