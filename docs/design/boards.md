# Label board visual reference

Measured from the ignored `deisgn.html` Claude export, section **03 Web — Board**.
Reference viewport: 1440 × 900. Use existing theme tokens, including their dark
variants; illustrative export content and sample counts are not application data.

| Part              | Measurement / styling                                                         |
| ----------------- | ----------------------------------------------------------------------------- |
| Frame             | 60px icon rail, full-bleed canvas, 2px divider                                |
| Grid              | 24px squares at 100%, 1px accent at 11% opacity                               |
| Header            | 14px vertical / 20px horizontal padding; 16px bold label; 12px save state     |
| Tools             | Left 20px; 6px panel padding, 2px gap; 36px controls; surface / medium shadow |
| Selected card     | 300px width; 200px image; accent 2px outline; medium shadow                   |
| Card text         | 12px / 14px padding; 8px gap; 11px source; 15px title                         |
| Card shape        | Square theme corners; surface fill; small shadow; cropped media               |
| Resize handles    | 9px squares, 2px accent border, background fill                               |
| Selection toolbar | 4px padding, 2px gap, 30px controls; surface / medium shadow                  |
| Heading           | Archivo 800, 42px, -0.02em tracking, line height 1                            |
| Tray              | Floating surface / medium shadow; 10px / 14px padding; 20px bottom inset      |
| Zoom              | Bottom right floating surface, separate from scalable canvas                  |

The export rail overrides use dark violet tokens. Reuse the existing app rail
and shared theme rather than hardcoding a second palette. Foundations use Archivo,
square corners, 4/8/12/16/24/32px spacing, ink-tinted shadows and accent selection.

Reviewed behavioral defaults: 300px card width, 200px image, 120px text (including
padding); 160px minimum width; 80px minimum visible region; zoom 25–200%; 100
session history entries; first image/poster cropped with preserved aspect ratio;
fixed heading typography; one connection per unordered pair; None/End/Both arrows,
200-character edge label. Browse Newest/Oldest and search Best match. Performance
fixture: 100 cards, 10 columns, 100 edges, 10 seconds, 33ms p95 frame interval on
recorded hardware.

Columns replace illustrative freeform frames. The expanded searchable tray is an
intentional extension. Independent board names, sample headings/content, Export,
archived playback, arbitrary text formatting and frames are deferred. Deleting a
column retains displayed child dimensions, positions and edges; this remains a
provisional v1 rule.
