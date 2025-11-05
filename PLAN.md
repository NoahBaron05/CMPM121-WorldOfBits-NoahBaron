# D3: World of Bits

## Game Design Vision

{a few-sentence description of the game mechanics}

## Technologies

- TypeScript for most game code, little to no explicit HTML, and all CSS collected in common `style.css` file
- Deno and Vite for building
- GitHub Actions + GitHub Pages for deployment automation

## Assignments

## D3.a: Core mechanics (token collection and crafting)

Key technical challenge: Can you assemble a map-based user interface using the Leaflet mapping framework?

Key gameplay challenge: Can players collect and craft tokens from nearby locations to finally make one of sufficiently high value?

### Steps

- [x] copy main.ts to reference.ts for future reference
- [x] delete everything in main.ts
- [x] put a basic leaflet map on the screen
- [x] draw the player's location on the map
- [x] draw a rectangle representing one cell on the map
- [x] use loops to draw a whole grid of cells on the map
- [x] draw cells to the edge of the map
- [ ] player can only interact with cells near them
- [ ] the state of cells is consistent across loads
- [ ] player can pick up tokens, and they remove them from the cell and put it into their inventory
- [ ] displays token in inventory when it is held
- [ ] if the player has a token, they can place it in a cell with an equal token value to double it
- [ ] the game detects when a player has sufficient tokens in hand
