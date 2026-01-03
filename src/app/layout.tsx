@tailwind base;
@tailwind components;
@tailwind utilities;

/* Prevent tiny horizontal overflows on small screens (common with long token symbols/addresses). */
html,
body {
  overflow-x: hidden;
}

:root {
  color-scheme: dark;
}

/* Global sizing: many devices look "perfect" around ~80–90% browser zoom.
   We mimic that by lowering the root font size (Tailwind uses rem).
   This is an additional -10% vs the previous values (14→12.6, 15→13.5, 16→14.4). */
html {
  font-size: 12.6px;
}
@media (min-width: 1024px) {
  html { font-size: 13.5px; }
}
@media (min-width: 1536px) {
  html { font-size: 14.4px; }
}


html, body {
  min-height: 100%;
}

/* Put the background on the root element so it stays consistent on long pages. */
html {
  background: radial-gradient(1200px 600px at 10% 10%, rgba(120, 60, 255, 0.15), transparent 60%),
              radial-gradient(900px 500px at 90% 20%, rgba(40, 220, 180, 0.12), transparent 55%),
              radial-gradient(1100px 700px at 50% 120%, rgba(255, 180, 40, 0.08), transparent 60%),
              #0b0e14;
  background-repeat: no-repeat;
  background-attachment: fixed;
}

body {
  min-height: 100%;
  background: transparent;
  color: rgba(255, 255, 255, 0.92);
}
