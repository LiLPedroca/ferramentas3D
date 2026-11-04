// Ponto de entrada da tela: liga os módulos e abre o início.
import { iniciarCalculadora } from "./calculadora-tela.js";
import { carregarClientes, iniciarClientes } from "./clientes.js";
import { carregarOrcamentos, iniciarOrcamentos } from "./orcamentos.js";
import { iniciarBackup } from "./backup-tela.js";
import { iniciarMetadados } from "./metadados-tela.js";
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
iniciarClientes();
iniciarOrcamentos();
iniciarBackup();
iniciarMetadados();
registrarAoAbrir("orcamentos", carregarOrcamentos);
registrarAoAbrir("produtos", carregarProdutos);
registrarAoAbrir("clientes", carregarClientes);
registrarAoAbrir("visualizador", iniciarVisualizador);

irPara("inicio");
carregarConfig();
