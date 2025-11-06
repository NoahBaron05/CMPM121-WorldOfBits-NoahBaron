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

- [x] **#Step 1:** copy main.ts to reference.ts for future reference
- [x] **#Step 2:** delete everything in main.ts
- [x] **#Step 3:** put a basic leaflet map on the screen
- [x] **#Step 4:** draw the player's location on the map
- [x] **#Step 5:** draw a rectangle representing one cell on the map
- [x] **#Step 6:** use loops to draw a whole grid of cells on the map
- [x] **#Step 7:** draw cells to the edge of the map
- [ ] **#Step 8:** player can only interact with cells near them
- [x] **#Step 9:** the state of cells is consistent across loads
- [x] **#Step 10:** player can pick up tokens, and they remove them from the cell and put it into their inventory
- [x] **#Step 11:** displays token in inventory when it is held
- [x] **#Step 12:** if the player has a token, they can place it in a cell with an equal token value to double it
- [ ] **#Step 13:** the game detects when a player has sufficient tokens in hand
