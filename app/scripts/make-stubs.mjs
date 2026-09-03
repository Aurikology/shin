/**
 * Creates a placeholder for every screen so the app boots before any screen is
 * written, and so several people can build screens at the same time without
 * touching index.html or one another's files. Never overwrites a real screen.
 */
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PUB = fileURLToPath(new URL('../public/', import.meta.url));

export const SCREENS = [
  ['prelaunch', 'Before the app', '00 and 01'],
  ['intro', 'Shin says hello', '02'],
  ['setup', 'Setup', '03'],
  ['scan', 'Scan', '04'],
  ['identify', 'What it thinks it is', '05'],
  ['verdict', 'The verdict', '06'],
  ['correct', 'Shin is wrong', '06b'],
  ['actions', 'What you can do', '07'],
  ['share', 'Share', '08'],
  ['paywall', 'Shin Pro', '09'],
  ['home', 'Home', '10'],
  ['notify', 'Price drop', '11'],
  ['weektwo', 'Week two', '12'],
  ['stagemap', 'Stages', 'nav'],
];

mkdirSync(PUB + 'js/screens', { recursive: true });
mkdirSync(PUB + 'css/screens', { recursive: true });

let made = 0;
for (const [id, title, stage] of SCREENS) {
  const js = `${PUB}js/screens/${id}.js`;
  const css = `${PUB}css/screens/${id}.css`;
  if (!existsSync(js)) {
    writeFileSync(
      js,
      [
        `/** Stage ${stage}: ${title}. NOT BUILT YET. */`,
        `export default {`,
        `  id: '${id}',`,
        `  title: '${title}',`,
        `  render(root) {`,
        `    root.innerHTML =`,
        `      '<div class="empty">' +`,
        `      '<p class="kicker">Stage ${stage}</p>' +`,
        `      '<h2>${title}</h2>' +`,
        `      '<p>This screen is not built yet.</p></div>';`,
        `  },`,
        `};`,
        ``,
      ].join('\n'),
      'utf8',
    );
    made += 1;
  }
  if (!existsSync(css)) {
    writeFileSync(css, `/* Stage ${stage}: ${title}. Owned by this screen alone. */\n`, 'utf8');
  }
}

writeFileSync(
  `${PUB}css/screens.css`,
  [
    '/*',
    ' * Screen stylesheets, one per screen, imported here so index.html never has to',
    ' * change when a screen is added. Each file is owned by its screen and by nothing',
    ' * else, which is what lets several screens be built at the same time.',
    ' */',
    ...SCREENS.map(([id]) => `@import url('/css/screens/${id}.css');`),
    '',
  ].join('\n'),
  'utf8',
);

console.log(`screens: ${SCREENS.length}, stubs created: ${made}`);
