# Little Lesson art reference

The seven SVGs in `public/art/` contain original pixel shapes. The three supplied references informed the classroom arrangement, warm floor, green board, and white dialogue portraits. Pip and the student are original human children.

## Assets and coordinates

| Asset | Viewbox | Display size | Content |
| --- | --- | --- | --- |
| `classroom.svg` | `0 0 256 160` | 512 by 320 pixels | Classroom, desks, Pip, and student |
| `child-listening.svg` | `0 0 64 64` | 192 by 192 pixels | Open eyes and small smile |
| `child-thinking.svg` | `0 0 64 64` | 192 by 192 pixels | Uneven brows, side gaze, and hand at cheek |
| `child-puzzled.svg` | `0 0 64 64` | 192 by 192 pixels | Raised brow, uncertain mouth, and question mark |
| `child-aha.svg` | `0 0 64 64` | 192 by 192 pixels | Closed smiling eyes, open smile, and spark |
| `student-speaking.svg` | `0 0 64 64` | 192 by 192 pixels | Open speaking mouth |
| `student-waiting.svg` | `0 0 64 64` | 192 by 192 pixels | Relaxed eyes and closed mouth |

Portraits contain white shapes and transparent cutouts. A black dialogue background supplies their facial lines. Each portrait has a unique mask identifier. Portraits remain crisp at integer multiples of 64 pixels.

The scene uses a 256 by 160 logical pixel grid. All composition coordinates below refer to that grid. Multiply each coordinate by two for the default 512 by 320 display.

| Element | Bounds or anchor |
| --- | --- |
| Chalkboard | x 66 to 195, y 7 to 49 |
| Student by board | origin 163, 51 |
| Pip at front desk | origin 117, 79 |
| Pip's desk | origin 111, 105 |
| Lower dialogue area | x 8 to 248, y 120 to 156 |

A black dialogue box across the lower dialogue area covers floor and foreground furniture. Pip's face and desktop remain visible above the box. The board carries a small decorative five-block addition exercise.

## Palette

| Role | Color |
| --- | --- |
| Outline | `#3b302f` |
| Wall | `#f5df9b` |
| Wall light | `#fff0b5` |
| Floor | `#d8a368` |
| Floor light | `#ebbb7d` |
| Floor seams | `#ae784d` |
| Board | `#386557` |
| Chalk | `#e7edc8` |
| Pip's shirt | `#438e94` |
| Pip's overalls | `#456e9a` |
| Pip's hair | `#85533c` |
| Skin | `#f6c79b` |
| Student's cardigan | `#d7a343` |
| Student's hair | `#3f393d` |

## Animation groups

The scene's `main-child` group has `transform="translate(117 79)"`. It contains `child-head`, `child-body`, and `child-legs`. These inner groups have no transforms. A one-pixel vertical translation on `child-head` or `child-body` gives Pip a restrained listening motion. A head rotation can use the local pivot `12 10`.

The `student-avatar` group has `transform="translate(163 51)"`. It contains `student-head`, `student-body`, and `student-legs`. The raised chalk hand is the separate scene group `student-gesture`. Student head movement can use the local pivot `12 10`. All scene IDs are unique.

An inline SVG exposes these groups to CSS and JavaScript. An SVG loaded with an HTML `img` element remains a static image. Existing translation transforms on the two character roots determine their positions.

The portrait files expose a final white group named after the file, such as `child-aha-portrait`. Expression changes replace the image source. Subtle one-pixel portrait motion can animate this group when inline.

## Verification

`build_art.py` regenerates the seven SVGs. It parses each SVG as XML and renders each with `rsvg-convert`. The Python 3.13 interpreter on this machine runs the generator successfully.

`verify_art.py` checks viewboxes, duplicate scene IDs, expected animation groups, portrait color, and transparent portrait backgrounds. `classroom.png` and `portraits-preview.png` are visual inspection artifacts.
