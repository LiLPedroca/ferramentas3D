// Ponto de entrada da tela: liga os módulos e abre o início.
import { iniciarCalculadora } from "./calculadora-tela.js";
import { iniciarConfiguracoes } from "./configuracoes-tela.js";
import { iniciarInicio } from "./inicio-tela.js";
import { carregarProdutos, iniciarProdutos } from "./produtos.js";
import { carregarConfig, iniciarShell, irPara, mostrarAviso, registrarAoAbrir } from "./shell.js";
import { iniciarVisualizador } from "./viewer3d.js";

iniciarShell();
iniciarInicio();
iniciarCalculadora();
iniciarConfiguracoes();
iniciarProdutos({ avisar: mostrarAviso, irPara });
registrarAoAbrir("produtos", carregarProdutos);
registrarAoAbrir("visualizador", iniciarVisualizador);

irPara("inicio");
carregarConfig();
