import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { criarCorte, posicaoDoCorte } from "../src/renderer/corte.js";

describe("posicaoDoCorte", () => {
  it("fica entre o começo e o fim da peça", () => {
    expect(posicaoDoCorte(10, 50, 0.5)).toEqual({ valor: 30, desdeInicio: 20 });
    expect(posicaoDoCorte(10, 50, -1).valor).toBe(10);
    expect(posicaoDoCorte(10, 50, 2).valor).toBe(50);
  });
});

describe("criarCorte", () => {
  const montar = () => {
    const cena = new THREE.Scene();
    const peca = new THREE.Group();
    // cubo de 20 mm apoiado na mesa (Y de 0 a 20, X e Z de -10 a 10)
    const g = new THREE.BoxGeometry(20, 20, 20).translate(0, 10, 0);
    peca.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial()));
    cena.add(peca);
    const corte = criarCorte({ cena, renderizador: {}, peca });
    return { peca, corte };
  };

  it("desligado mostra tudo e não recorta o material", () => {
    const { peca, corte } = montar();
    expect(corte.atualizar()).toBeNull();
    expect(corte.visivel(new THREE.Vector3(0, 19, 0))).toBe(true);
    expect(peca.children[0].material.clippingPlanes).toBeNull();
  });

  it("altura: some o que está acima do corte", () => {
    const { peca, corte } = montar();
    const faixa = corte.ligar(true);
    expect(faixa.desdeInicio).toBeCloseTo(10);
    expect(faixa.total).toBeCloseTo(20);
    expect(corte.visivel(new THREE.Vector3(0, 5, 0))).toBe(true);
    expect(corte.visivel(new THREE.Vector3(0, 15, 0))).toBe(false);
    expect(peca.children[0].material.clippingPlanes).toHaveLength(1);
  });

  it("frente e lado somem a parte da frente (Z+) e da direita (X+)", () => {
    const { corte } = montar();
    corte.ligar(true);
    corte.definir({ direcao: "frente", fracao: 0.25 });
    expect(corte.visivel(new THREE.Vector3(0, 10, -6))).toBe(true);
    expect(corte.visivel(new THREE.Vector3(0, 10, -4))).toBe(false);
    corte.definir({ direcao: "lado", fracao: 0.75 });
    expect(corte.visivel(new THREE.Vector3(4, 10, 0))).toBe(true);
    expect(corte.visivel(new THREE.Vector3(6, 10, 0))).toBe(false);
  });

  it("acompanha a peça quando ela é escalada", () => {
    const { peca, corte } = montar();
    corte.ligar(true);
    peca.scale.setScalar(2);
    expect(corte.atualizar().total).toBeCloseTo(40);
    expect(corte.visivel(new THREE.Vector3(0, 21, 0))).toBe(false);
  });
});
