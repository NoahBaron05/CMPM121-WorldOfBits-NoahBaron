// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css"; // supporting style for Leaflet
import "./style.css"; // student-controlled page style

// Fix missing marker images
import "./_leafletWorkaround.ts"; // fixes for missing Leaflet images
import luck from "./_luck.ts";

// Import our luck function

const mapDiv = document.createElement("div");
mapDiv.id = "map";
document.body.append(mapDiv);

const SPAWN_POINT = leaflet.latLng(57.476538, -4.225123);
const RECTANGLE_SPAWN_PROBABILITY = 0.2;

const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE_X = 22;
const NEIGHBORHOOD_SIZE_Y = 6;

const winCount: number = 16;

interface token {
  value: number | null;
}

const playerInventory: token = {
  value: 0,
};

const map = leaflet.map(mapDiv, {
  center: SPAWN_POINT,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: GAMEPLAY_ZOOM_LEVEL,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

const playerLocation = leaflet.marker(SPAWN_POINT);
playerLocation.addTo(map);

function spawnRectangle(i: number, j: number) {
  const origin = SPAWN_POINT;
  const bounds = leaflet.latLngBounds([
    [origin.lat + i * TILE_DEGREES, origin.lng + j * TILE_DEGREES],
    [origin.lat + (i + 1) * TILE_DEGREES, origin.lng + (j + 1) * TILE_DEGREES],
  ]);

  const rectToken: token = {
    value: 1,
  };

  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);

  rect.bindPopup(() => {
    const popupDiv = document.createElement("div");

    if (rectToken.value !== null && playerInventory.value == 0) {
      popupDiv.innerHTML = `
        <p>Token value: ${rectToken.value}</p>
        <button id="takeToken">Take Token</button>
      `;
      popupDiv.querySelector("#takeToken")!.addEventListener("click", () => {
        playerInventory.value = rectToken.value;
        rectToken.value = null;
        inventoryDiv.innerText = `Inventory: ${playerInventory.value}`;
        rect.closePopup();
        winCondition(playerInventory.value!, winCount);
      });
    } else if (rectToken.value == null && playerInventory.value !== 0) {
      popupDiv.innerHTML = `
        <p>Token value: ${rectToken.value}</p>
        <button id="dropToken">Drop token</button>
      `;
      popupDiv.querySelector("#dropToken")!.addEventListener("click", () => {
        rectToken.value = playerInventory.value;
        playerInventory.value = 0;
        inventoryDiv.innerText = `Inventory: `;
        rect.closePopup();
      });
    } else if (
      rectToken.value == playerInventory.value && rectToken.value !== null
    ) {
      popupDiv.innerHTML = `
        <p>Token value: ${rectToken.value}</p>
        <button id="craftToken">Craft tokens</button>
      `;
      popupDiv.querySelector("#craftToken")!.addEventListener("click", () => {
        rectToken.value! += playerInventory.value!;
        playerInventory.value = 0;
        inventoryDiv.innerText = `Inventory: `;
        rect.closePopup();
      });
    } else if (
      rectToken.value != null && rectToken.value != playerInventory.value
    ) {
      popupDiv.innerHTML = `
        <p>Token value: ${rectToken.value}</p>
        <button id="closeButton">Close popup</button>
      `;
      popupDiv.querySelector("#closeButton")!.addEventListener("click", () => {
        rect.closePopup();
      });
    } else {
      popupDiv.innerHTML = `Unexpected interaction`;
    }

    return popupDiv;
  });
}

for (let i = -NEIGHBORHOOD_SIZE_Y; i < NEIGHBORHOOD_SIZE_Y; i++) {
  for (let j = -NEIGHBORHOOD_SIZE_X; j < NEIGHBORHOOD_SIZE_X; j++) {
    if (luck([i, j].toString()) < RECTANGLE_SPAWN_PROBABILITY) {
      spawnRectangle(i, j);
    }
  }
}

const inventoryDiv = document.createElement("div");
inventoryDiv.id = "inventory";
inventoryDiv.innerText = "\nInventory: ";
document.body.append(inventoryDiv);

function winCondition(currentToken: number, winCount: number) {
  if (currentToken == winCount) {
    const winDiv = document.createElement("div");
    winDiv.id = "win";
    winDiv.innerText = "\nCongratulations! You won!";
    document.body.append(winDiv);
  }
}
