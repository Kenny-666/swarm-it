# Credits and notices

Swarmline is its own extension: its engine (scanning the page, building it in place on the
real page, the tour, duplicates, the toolbar and everything around them) is Swarmline's.

Its **cursor motion and build style** follow **Swarm Rebuild** by **Dhvanil Patel**
([github.com/DhvanilPatel/swarm-cursors](https://github.com/DhvanilPatel/swarm-cursors)),
which is itself a tribute to **[Swarm](https://califa.github.io/swarm-site/)** by
**[Joel Califa](https://joelcalifa.com)**. These parts of `extension/swarmline.js` are adapted
from Swarm Rebuild, with permission, and stay their authors':

- how a cursor moves: the timing, easing and sideways bend of each move, the tempo that
  rises with the backlog, and spare cursors wandering, leaving and coming back
- the boids orbit (`follow()`) used before the build and around your pointer after it
- the build gestures: the crosshair drag for boxes (and where it stops on big boxes), the
  text-box drag, typing rhythm and growing headings, pen-tool lines, the Alt-drag duplicate
  and the double-click edit
- the structure of the sound engine (`Sound`); its instrument, scale and sounds are Swarmline's

Swarmline's own cursor set, colours, toolbar, sound design, icon, website and listing are
not taken from either project.
