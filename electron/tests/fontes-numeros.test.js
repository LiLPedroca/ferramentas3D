import { describe, expect, it } from "vitest";
import { FONTES, numeroDaFonte } from "../src/renderer/modelos/fontes.js";

// Os clientes pedem "fonte 12": o número de cada fonte não pode mudar.
const ORDEM = [
  "Lobster", "DancingScript", "Pacifico", "Yellowtail", "GrandHotel", "Cookie", "GreatVibes", "Sacramento",
  "Fredoka", "Baloo2", "Chewy", "LuckiestGuy", "BubblegumSans", "Modak", "Sniglet", "Comfortaa", "Righteous",
  "LilitaOne", "Bangers", "BebasNeue", "BlackOpsOne", "Oswald", "Rubik", "AbrilFatface",
  "Cinzel", "PlayfairDisplay",
  "Caveat", "CaveatBrush", "PermanentMarker",
];

describe("números das fontes", () => {
  it("as 29 fontes mantêm o número combinado", () => {
    ORDEM.forEach((id, i) => expect(numeroDaFonte(id)).toBe(i + 1));
  });
  it("toda fonte tem número", () => {
    for (const f of FONTES) expect(numeroDaFonte(f.id)).toBeGreaterThan(0);
  });
});
