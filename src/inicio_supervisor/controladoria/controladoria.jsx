import { useEffect, useMemo, useState } from "react";
import "./controladoria.css";

const AUTO_REFRESH_MS = 15000;
const MAX_INPUT_LENGTH = 100;

export default function Controladoria({ currentUser }) {
    const API_BASE_URL = import.meta.env.VITE_API_URL || "https://variables-etc-basketball-catalyst.trycloudflare.com";
    const tipoHeader = String(currentUser?.TIPO || currentUser?.tipo || "").trim().toUpperCase();
    const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== "";

    const formatKg = (value) => {
        const digitos = String(value || "").replace(/\D/g, "").slice(0, 7);
        if (!digitos) return "";
        return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    };
    const parseKg = (value = "") => Number(String(value).replace(/\D/g, "")) || 0;
    const calcularPesoLiquido = (pesoBruto, tara) => {
        const liquido = Math.max(0, parseKg(pesoBruto) - parseKg(tara));
        return formatKg(String(liquido));
    };
    const withKg = (value) => (hasValue(value) ? `${String(value).trim()} KG` : "-");

    const formatTextoMaiusculo = (value, limite = 80) => String(value || "").toUpperCase().slice(0, limite);
    const formatNome = (value) => String(value || "").replace(/[^a-zA-ZÀ-ÿ ]/g, "").toUpperCase().slice(0, 80);
    const formatPlaca = (value) => String(value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 7);
    const formatFotoSrc = (value) => {
        const texto = String(value || "").trim();
        if (!texto) return "";
        if (texto.startsWith("data:image") || texto.startsWith("http://") || texto.startsWith("https://") || texto.startsWith("blob:")) {
            return texto;
        }
        return `data:image/jpeg;base64,${texto}`;
    };

    const [registros, setRegistros] = useState([]);
    const [carregando, setCarregando] = useState(false);
    const [busca, setBusca] = useState("");
    const [statusFiltro, setStatusFiltro] = useState("TODOS");
    const [registroAbertoId, setRegistroAbertoId] = useState(null);
    const [idsSelecionados, setIdsSelecionados] = useState([]);
    const [edicao, setEdicao] = useState({
        unidade: "",
        zona: "",
        fazenda: "",
        empresa: "",
        motorista: "",
        placa: "",
        pesoEstimado: "",
        pesoLiquido: "",
        pesoBruto: "",
        tara: "",
        tipoPesagem: "BRUTO-TARA",
        refugo: "",
        temDivergencia: false,
        motivoDivergencia: "",
        status: "CGA"
    });

    const carregarProcessos = async () => {
        try {
            setCarregando(true);
            const response = await fetch(`${API_BASE_URL}/controladoria/processos`, {
                headers: { "x-user-type": tipoHeader }
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || "Falha ao carregar processos da controladoria.");
            }

            setRegistros(Array.isArray(data.processos) ? data.processos : []);
        } catch (error) {
            alert(`Erro ao carregar controladoria: ${error.message}`);
        } finally {
            setCarregando(false);
        }
    };

    useEffect(() => {
        carregarProcessos();

        const intervalId = setInterval(() => {
            carregarProcessos();
        }, AUTO_REFRESH_MS);

        return () => clearInterval(intervalId);
    }, [API_BASE_URL, tipoHeader]);

    useEffect(() => {
        setIdsSelecionados((anteriores) =>
            anteriores.filter((id) => registros.some((registro) => String(registro.id) === id))
        );
    }, [registros]);

    const registroAberto = useMemo(
        () => registros.find((item) => item.id === registroAbertoId) || null,
        [registroAbertoId, registros]
    );

    const pesoLiquidoCalculado = useMemo(
        () => calcularPesoLiquido(edicao.pesoBruto, edicao.tara),
        [edicao.pesoBruto, edicao.tara]
    );

    const kpis = useMemo(() => {
        const total = registros.length;
        const pendentes = registros.filter((item) => ["DIS", "AGE", "CGA"].includes(item.status)).length;
        const divergencia = registros.filter((item) => item.status === "DVG").length;
        const finalizados = registros.filter((item) => item.status === "FNL").length;
        return { total, pendentes, divergencia, finalizados };
    }, [registros]);

    const registrosFiltrados = useMemo(() => {
        const termo = busca.trim().toUpperCase();

        const filtrados = registros.filter((item) => {
            const statusOk = statusFiltro === "TODOS" ? true : item.status === statusFiltro;
            if (!statusOk) return false;

            if (!termo) return true;
            const alvo = [
                item.id,
                item.unidade,
                item.zona,
                item.fazenda,
                item.empresa,
                item.motorista,
                item.placa
            ].join(" ").toUpperCase();

            return alvo.includes(termo);
        });

        return [...filtrados].sort((a, b) => {
            const aFinalizado = a.status === "FNL" ? 1 : 0;
            const bFinalizado = b.status === "FNL" ? 1 : 0;
            return aFinalizado - bFinalizado;
        });
    }, [busca, registros, statusFiltro]);

    const idsFiltrados = useMemo(
        () => registrosFiltrados.map((item) => String(item.id)),
        [registrosFiltrados]
    );

    const todosFiltradosSelecionados = idsFiltrados.length > 0
        && idsFiltrados.every((id) => idsSelecionados.includes(id));

    const fotosRegistroAberto = useMemo(() => {
        const lista = Array.isArray(registroAberto?.fotos) ? registroAberto.fotos : [];
        return lista.map((item) => formatFotoSrc(item)).filter(Boolean);
    }, [registroAberto]);

    const notificacoes = useMemo(() => {
        const lista = [];
        if (kpis.pendentes > 0) lista.push(`${kpis.pendentes} processo(s) aguardando validação final`);
        if (kpis.divergencia > 0) lista.push(`${kpis.divergencia} processo(s) com divergência`);
        if (kpis.finalizados > 0) lista.push(`${kpis.finalizados} processo(s) finalizados hoje`);
        return lista;
    }, [kpis]);

    const abrirRegistro = (registro) => {
        const possuiDivergencia = hasValue(registro.motivoDivergencia);
        setRegistroAbertoId(registro.id);
        setEdicao({
            unidade: registro.unidade || "",
            zona: registro.zona || "",
            fazenda: registro.fazenda || "",
            empresa: registro.empresa || "",
            motorista: registro.motorista || "",
            placa: registro.placa || "",
            pesoEstimado: registro.pesoEstimado || "",
            pesoLiquido: registro.pesoLiquido || "",
            pesoBruto: registro.pesoBruto || "",
            tara: registro.tara || "",
            tipoPesagem: "BRUTO-TARA",
            refugo: registro.refugo || "",
            temDivergencia: possuiDivergencia,
            motivoDivergencia: registro.motivoDivergencia || "",
            status: registro.status || "CGA"
        });
    };

    const atualizarRegistroAberto = async (action) => {
        if (!registroAbertoId) return;
        try {
            const response = await fetch(`${API_BASE_URL}/controladoria/processos/${encodeURIComponent(registroAbertoId)}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "x-user-type": tipoHeader
                },
                body: JSON.stringify({
                    action,
                    unidade: edicao.unidade,
                    zona: edicao.zona,
                    fazenda: edicao.fazenda,
                    empresa: edicao.empresa,
                    motorista: edicao.motorista,
                    placa: edicao.placa,
                    pesoEstimado: edicao.pesoEstimado,
                    pesoLiquido: pesoLiquidoCalculado,
                    pesoBruto: edicao.pesoBruto,
                    tara: edicao.tara,
                    tipoPesagem: edicao.tipoPesagem,
                    refugo: edicao.refugo,
                    motivoDivergencia: edicao.temDivergencia ? edicao.motivoDivergencia : "",
                    status: edicao.status
                })
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.error || data.detail || "Falha ao atualizar processo da controladoria.");
            }

            await carregarProcessos();
            if (action === "finalizar") {
                setRegistroAbertoId(null);
            }
            alert(data.message || "Processo atualizado com sucesso!");
            return true;
        } catch (error) {
            alert(`Erro ao atualizar processo: ${error.message}`);
            return false;
        }
    };

    const salvarEdicao = () => {
        if (!registroAberto) return;

        const divergenciaOriginal = hasValue(registroAberto.motivoDivergencia) || registroAberto.status === "DVG";

        const houveAlteracao = (
            (registroAberto.unidade || "") !== edicao.unidade ||
            (registroAberto.zona || "") !== edicao.zona ||
            (registroAberto.fazenda || "") !== edicao.fazenda ||
            (registroAberto.empresa || "") !== edicao.empresa ||
            (registroAberto.motorista || "") !== edicao.motorista ||
            (registroAberto.placa || "") !== edicao.placa ||
            (registroAberto.pesoEstimado || "") !== edicao.pesoEstimado ||
            (registroAberto.pesoLiquido || "") !== pesoLiquidoCalculado ||
            (registroAberto.pesoBruto || "") !== edicao.pesoBruto ||
            (registroAberto.tara || "") !== edicao.tara ||
            (registroAberto.tipoPesagem || "") !== edicao.tipoPesagem ||
            (registroAberto.refugo || "") !== edicao.refugo ||
            divergenciaOriginal !== edicao.temDivergencia ||
            (registroAberto.motivoDivergencia || "") !== edicao.motivoDivergencia ||
            (registroAberto.status || "CGA") !== edicao.status
        );

        if (!houveAlteracao) {
            alert("Nenhuma alteração foi feita para salvar.");
            return;
        }

        atualizarRegistroAberto("editar");
    };

    const marcarDivergencia = () => atualizarRegistroAberto("divergencia");

    const camposPendentesFinalizacao = useMemo(() => {
        if (!registroAberto) return [];

        const obrigatorios = [
            ["unidade", "unidade"],
            ["zona", "zona"],
            ["fazenda", "fazenda"],
            ["empresa", "empresa"],
            ["motorista", "motorista"],
            ["placa", "placa"],
            ["pesoEstimado", "peso estimado"],
            ["pesoLiquido", "peso liquido"],
            ["pesoBruto", "peso bruto"],
            ["tara", "tara"],
            ["tipoPesagem", "tipo de pesagem"],
            ["refugo", "refugo"]
        ];

        const faltando = obrigatorios
            .filter(([chave]) => {
                if (chave === "pesoLiquido") return !hasValue(pesoLiquidoCalculado);
                return !hasValue(edicao[chave]);
            })
            .map(([, legenda]) => legenda);

        const qtdFotos = Number(registroAberto.fotosCount || 0);
        if (!Number.isFinite(qtdFotos) || qtdFotos <= 0) {
            faltando.push("fotos");
        }

        return faltando;
    }, [edicao, registroAberto, pesoLiquidoCalculado]);

    const finalizarRegistro = async () => {
        if (camposPendentesFinalizacao.length > 0) {
            alert(`Não é possível finalizar sem preencher todos os campos. Pendentes: ${camposPendentesFinalizacao.join(", ")}.`);
            return;
        }
        await atualizarRegistroAberto("finalizar");
    };

    const registroJaFinalizado = registroAberto?.status === "FNL";

    const alternarSelecaoLinha = (id) => {
        const idNormalizado = String(id);
        setIdsSelecionados((anteriores) => (
            anteriores.includes(idNormalizado)
                ? anteriores.filter((item) => item !== idNormalizado)
                : [...anteriores, idNormalizado]
        ));
    };

    const alternarSelecaoTodosFiltrados = () => {
        if (todosFiltradosSelecionados) {
            setIdsSelecionados((anteriores) => anteriores.filter((id) => !idsFiltrados.includes(id)));
            return;
        }

        setIdsSelecionados((anteriores) => {
            const combinados = new Set([...anteriores, ...idsFiltrados]);
            return Array.from(combinados);
        });
    };

    const obterRegistrosSelecionados = () => {
        const selecionados = registros.filter((item) => idsSelecionados.includes(String(item.id)));
        if (selecionados.length === 0) {
            alert("Selecione ao menos uma linha para exportar.");
            return [];
        }
        return selecionados;
    };

    const escaparHtml = (value) => String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const exportarCsv = () => {
        const selecionados = obterRegistrosSelecionados();
        if (selecionados.length === 0) return;

        const colunasPreferenciais = [
            "id",
            "unidade",
            "zona",
            "fazenda",
            "empresa",
            "cnpj",
            "motorista",
            "placa",
            "pesoEstimado",
            "pesoLiquido",
            "pesoBruto",
            "tara",
            "tipoPesagem",
            "refugo",
            "motivoDivergencia",
            "status",
            "criadoEm",
            "fotosCount",
            "fotos"
        ];

        const todasAsChaves = Array.from(
            new Set(selecionados.flatMap((item) => Object.keys(item || {})))
        );

        const colunas = [
            ...colunasPreferenciais.filter((chave) => todasAsChaves.includes(chave)),
            ...todasAsChaves.filter((chave) => !colunasPreferenciais.includes(chave))
        ];

        const escapeCsv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

        const formatarValorCsv = (value) => {
            if (Array.isArray(value)) return value.join(" | ");
            if (value && typeof value === "object") return JSON.stringify(value);
            return value ?? "";
        };

        const linhas = selecionados.map((item) =>
            colunas
                .map((coluna) => formatarValorCsv(item?.[coluna]))
                .map(escapeCsv)
                .join(",")
        );

        const csv = [colunas.join(","), ...linhas].join("\n");
        const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
        link.href = url;
        link.download = `controladoria_export_${stamp}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    const exportarPdf = () => {
        const selecionados = obterRegistrosSelecionados();
        if (selecionados.length === 0) return;

        const linhasHtml = selecionados.map((item) => `
            <tr>
                <td>${escaparHtml(item.id)}</td>
                <td>${escaparHtml(item.unidade)}</td>
                <td>${escaparHtml(item.zona)}</td>
                <td>${escaparHtml(item.fazenda)}</td>
                <td>${escaparHtml(item.empresa)}</td>
                <td>${escaparHtml(item.motorista)}</td>
                <td>${escaparHtml(item.placa)}</td>
                <td>${escaparHtml(item.pesoLiquido)}</td>
                <td>${escaparHtml(item.status)}</td>
            </tr>
        `).join("");

        const janela = window.open("", "_blank", "width=1200,height=800");
        if (!janela) {
            alert("Não foi possível abrir a impressão. Verifique se o navegador bloqueou pop-up.");
            return;
        }

        janela.document.write(`
            <html>
                <head>
                    <title>Exportação Controladoria</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 16px; color: #111; }
                        h2 { margin: 0 0 12px; }
                        table { width: 100%; border-collapse: collapse; }
                        th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; text-align: left; }
                        th { background: #f3f3f3; }
                    </style>
                </head>
                <body>
                    <h2>Exportação Controladoria (${selecionados.length} registro(s))</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Unidade</th>
                                <th>Zona</th>
                                <th>Fazenda</th>
                                <th>Empresa</th>
                                <th>Motorista</th>
                                <th>Placa</th>
                                <th>Peso Líquido</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>${linhasHtml}</tbody>
                    </table>
                </body>
            </html>
        `);
        janela.document.close();
        janela.focus();
        janela.print();
    };

    return (
        <div className="controladoria-main">
            <header className="controladoria-header">
                <h3>CONTROLADORIA OPERACIONAL</h3>
            </header>

            <section className="controladoria-kpis">
                <article><span>Total</span><strong>{kpis.total}</strong></article>
                <article><span>Pendentes</span><strong>{kpis.pendentes}</strong></article>
                <article><span>Divergências</span><strong>{kpis.divergencia}</strong></article>
                <article><span>Finalizados</span><strong>{kpis.finalizados}</strong></article>
            </section>

            <section className="controladoria-filtros">
                <input
                    type="text"
                    maxLength={MAX_INPUT_LENGTH}
                    placeholder="Pesquisar por ID, unidade, zona, fazenda, empresa, placa..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value.toUpperCase())}
                />
                <select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)}>
                    <option value="TODOS">Todos os status</option>
                    <option value="DIS">Disponível (DIS)</option>
                    <option value="AGE">Agendado (AGE)</option>
                    <option value="CGA">Pendente (CGA)</option>
                    <option value="DVG">Divergência (DVG)</option>
                    <option value="FNL">Finalizado (FNL)</option>
                </select>
            </section>

            <section className="controladoria-acoes-exportacao">
                <button type="button" onClick={alternarSelecaoTodosFiltrados}>
                    {todosFiltradosSelecionados ? "Desmarcar filtrados" : "Selecionar filtrados"}
                </button>
                <button type="button" onClick={exportarCsv}>Exportar CSV</button>
                <button type="button" onClick={exportarPdf}>Imprimir / PDF</button>
                <span>{idsSelecionados.length} linha(s) selecionada(s)</span>
            </section>

            <section className="controladoria-notificacoes">
                <h4>Notificações</h4>
                {notificacoes.length === 0 ? (
                    <p>Sem alertas no momento.</p>
                ) : (
                    <ul>
                        {notificacoes.map((aviso) => <li key={aviso}>{aviso}</li>)}
                    </ul>
                )}
            </section>

            <section className="controladoria-tabela-wrapper">
                {carregando && <p style={{ padding: "0.75rem" }}>Carregando processos...</p>}
                <table className="controladoria-tabela">
                    <thead>
                        <tr>
                            <th>
                                <input
                                    type="checkbox"
                                    checked={todosFiltradosSelecionados}
                                    onChange={alternarSelecaoTodosFiltrados}
                                    aria-label="Selecionar todos filtrados"
                                />
                            </th>
                            <th>ID</th>
                            <th>Unidade</th>
                            <th>Zona</th>
                            <th>Empresa</th>
                            <th>Placa</th>
                            <th>Peso Líquido (KG)</th>
                            <th>Status</th>
                            <th>Ação</th>
                        </tr>
                    </thead>
                    <tbody>
                        {registrosFiltrados.map((item) => (
                            <tr key={item.id}>
                                <td>
                                    <input
                                        type="checkbox"
                                        checked={idsSelecionados.includes(String(item.id))}
                                        onChange={() => alternarSelecaoLinha(item.id)}
                                        aria-label={`Selecionar ${item.id}`}
                                    />
                                </td>
                                <td>{item.id}</td>
                                <td>{item.unidade}</td>
                                <td>{item.zona}</td>
                                <td>{item.empresa}</td>
                                <td>{item.placa}</td>
                                <td>{withKg(item.pesoLiquido)}</td>
                                <td><span className={`badge-${item.status.toLowerCase()}`}>{item.status}</span></td>
                                <td>
                                    <button type="button" onClick={() => abrirRegistro(item)}>Abrir</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            {registroAberto && (
                <div className="controladoria-overlay" onClick={() => setRegistroAbertoId(null)}>
                <aside className="controladoria-drawer" onClick={(e) => e.stopPropagation()}>
                    <div className="drawer-head">
                        <h4>{registroAberto.id}</h4>
                        <button type="button" onClick={() => setRegistroAbertoId(null)}>✕</button>
                    </div>

                    <p><strong>Empresa:</strong> {registroAberto.empresa}</p>
                    <p><strong>Fazenda:</strong> {registroAberto.fazenda}</p>
                    <p><strong>Motorista:</strong> {registroAberto.motorista}</p>

                    <div className="controladoria-fotos">
                        <h5>Fotos do carregamento</h5>
                        {fotosRegistroAberto.length === 0 ? (
                            <p>Sem fotos anexadas.</p>
                        ) : (
                            <div className="controladoria-fotos-grid">
                                {fotosRegistroAberto.map((foto, index) => (
                                    <a key={`${registroAberto.id}-foto-${index}`} href={foto} target="_blank" rel="noreferrer">
                                        <img src={foto} alt={`Foto ${index + 1} do processo ${registroAberto.id}`} />
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>

                    <label>
                        Unidade
                        <input
                            type="text"
                            maxLength={MAX_INPUT_LENGTH}
                            value={edicao.unidade}
                            placeholder="Ex: 112"
                            onChange={(e) => setEdicao((prev) => ({ ...prev, unidade: formatTextoMaiusculo(e.target.value, 40) }))}
                        />
                    </label>

                    <label>
                        Zona
                        <input
                            type="text"
                            maxLength={MAX_INPUT_LENGTH}
                            value={edicao.zona}
                            placeholder="Ex: 123"
                            onChange={(e) => setEdicao((prev) => ({ ...prev, zona: formatTextoMaiusculo(e.target.value, 40) }))}
                        />
                    </label>

                    <label>
                        Fazenda
                        <input
                            type="text"
                            maxLength={MAX_INPUT_LENGTH}
                            value={edicao.fazenda}
                            placeholder="Ex: FAZENDA MODELO"
                            onChange={(e) => setEdicao((prev) => ({ ...prev, fazenda: formatTextoMaiusculo(e.target.value, 80) }))}
                        />
                    </label>

                    <label>
                        Empresa
                        <input
                            type="text"
                            maxLength={MAX_INPUT_LENGTH}
                            value={edicao.empresa}
                            placeholder="Ex: AGT TRANSPORTES"
                            onChange={(e) => setEdicao((prev) => ({ ...prev, empresa: formatTextoMaiusculo(e.target.value, 80) }))}
                        />
                    </label>

                    <label>
                        Motorista
                        <input
                            type="text"
                            maxLength={MAX_INPUT_LENGTH}
                            value={edicao.motorista}
                            placeholder="Ex: JOÃO SILVA"
                            onChange={(e) => setEdicao((prev) => ({ ...prev, motorista: formatNome(e.target.value) }))}
                        />
                    </label>

                    <label>
                        Placa
                        <input
                            type="text"
                            maxLength={MAX_INPUT_LENGTH}
                            value={edicao.placa}
                            placeholder="Ex: ABC1234"
                            onChange={(e) => setEdicao((prev) => ({ ...prev, placa: formatPlaca(e.target.value) }))}
                        />
                    </label>

                    <label>
                        Peso estimado (KG)
                        <input
                            type="text"
                            maxLength={MAX_INPUT_LENGTH}
                            value={edicao.pesoEstimado}
                            placeholder="Ex: 3,000 KG"
                            onChange={(e) => setEdicao((prev) => ({ ...prev, pesoEstimado: formatKg(e.target.value) }))}
                        />
                    </label>

                    <label>
                        Peso líquido conferido (KG)
                        <input
                            type="text"
                            maxLength={MAX_INPUT_LENGTH}
                            value={pesoLiquidoCalculado}
                            placeholder="AUTOMÁTICO (BRUTO - TARA)"
                            readOnly
                        />
                    </label>

                    <label>
                        Peso bruto (KG)
                        <input
                            type="text"
                            maxLength={MAX_INPUT_LENGTH}
                            value={edicao.pesoBruto}
                            placeholder="Ex: 3,200 KG"
                            onChange={(e) => setEdicao((prev) => ({ ...prev, pesoBruto: formatKg(e.target.value) }))}
                        />
                    </label>

                    <label>
                        Tara (KG)
                        <input
                            type="text"
                            maxLength={MAX_INPUT_LENGTH}
                            value={edicao.tara}
                            placeholder="Ex: 350 KG"
                            onChange={(e) => setEdicao((prev) => ({ ...prev, tara: formatKg(e.target.value) }))}
                        />
                    </label>

                    <label>
                        Tipo de pesagem
                        <input
                            type="text"
                            maxLength={MAX_INPUT_LENGTH}
                            value="BRUTO-TARA"
                            readOnly
                        />
                    </label>

                    <label>
                        Refugo (kg)
                        <input
                            type="text"
                            maxLength={MAX_INPUT_LENGTH}
                            value={edicao.refugo}
                            placeholder="Ex: 50 KG"
                            onChange={(e) => setEdicao((prev) => ({ ...prev, refugo: formatKg(e.target.value) }))}
                        />
                    </label>

                    <label>
                        O item possui divergência?
                        <select
                            value={edicao.temDivergencia ? "SIM" : "NAO"}
                            onChange={(e) => {
                                const possui = e.target.value === "SIM";
                                setEdicao((prev) => ({
                                    ...prev,
                                    temDivergencia: possui,
                                    motivoDivergencia: possui ? prev.motivoDivergencia : ""
                                }));
                            }}
                        >
                            <option value="NAO">NÃO</option>
                            <option value="SIM">SIM</option>
                        </select>
                    </label>

                    {edicao.temDivergencia && (
                    <label>
                        Motivo de divergência
                        <input
                            type="text"
                            value={edicao.motivoDivergencia}
                            placeholder="Descreva o motivo"
                            onChange={(e) => setEdicao((prev) => ({ ...prev, motivoDivergencia: formatTextoMaiusculo(e.target.value, 120) }))}
                        />
                    </label>
                    )}

                    <label>
                        Status
                        <select
                            value={edicao.status}
                            onChange={(e) => setEdicao((prev) => ({ ...prev, status: e.target.value }))}
                        >
                            <option value="DIS">DIS</option>
                            <option value="AGE">AGE</option>
                            <option value="CGA">CGA</option>
                            <option value="DVG">DVG</option>
                            <option value="FNL">FNL</option>
                        </select>
                    </label>

                    <div className="drawer-actions">
                        <button type="button" onClick={salvarEdicao}>Salvar edição</button>
                        <button type="button" onClick={marcarDivergencia}>Marcar divergência</button>
                        <button
                            type="button"
                            className={registroJaFinalizado ? "btn-finalizado" : ""}
                            onClick={finalizarRegistro}
                            disabled={registroJaFinalizado}
                            title={registroJaFinalizado
                                ? "Processo já finalizado"
                                : camposPendentesFinalizacao.length > 0
                                    ? `Preencha antes de finalizar: ${camposPendentesFinalizacao.join(", ")}`
                                    : "Finalizar processo"}
                        >
                            {registroJaFinalizado ? "Finalizado" : "Finalizar"}
                        </button>
                    </div>
                </aside>
                </div>
            )}
        </div>
    );
}