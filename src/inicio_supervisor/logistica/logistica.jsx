import "./logistica.css";
import { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_FORM_KEY = "logistica_formData_v1";
const STORAGE_REGISTROS_KEY = "logistica_registros_v1";
const AUTO_REFRESH_MS = 15000;
const MAX_INPUT_LENGTH = 100;

const estadoInicialForm = {
    disponibilidade: "",
    tipoFrota: "TERCEIRO",
    frota: "",
    cpf: "",
    nome: "",
    empresa: "",
    placa: "",
    capacidade: "",
    destino: "",
    combustivel: "",
    frete: ""
};

export default function LogisticaPage({ currentUser }) {
    const API_BASE_URL = import.meta.env.VITE_API_URL || "https://variables-etc-basketball-catalyst.trycloudflare.com";
    const tipoHeader = String(currentUser?.TIPO || currentUser?.tipo || "").trim().toUpperCase();

    const cpfRef = useRef();
    const nomeRef = useRef();
    const empresaRef = useRef();
    const placaRef = useRef();
    const capacidadeRef = useRef();
    const destinoRef = useRef();
    const combustivelRef = useRef();
    const freteRef = useRef();
    const btnRef = useRef();

    const [registros, setRegistros] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_REGISTROS_KEY);
            const parsed = saved ? JSON.parse(saved) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    });
    const [disponibilidades, setDisponibilidades] = useState([]);
    const [carregandoDisponibilidades, setCarregandoDisponibilidades] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [feedback, setFeedback] = useState("");
    const [editando, setEditando] = useState(null);
    const [formData, setFormData] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_FORM_KEY);
            const parsed = saved ? JSON.parse(saved) : null;
            return parsed ? { ...estadoInicialForm, ...parsed } : estadoInicialForm;
        } catch {
            return estadoInicialForm;
        }
    });
    const [formEdicao, setFormEdicao] = useState(estadoInicialForm);

    const disponibilidadesDisponiveis = useMemo(() => {
        const idsJaAgendados = new Set(registros.map((registro) => String(registro.disponibilidade)));
        return disponibilidades.filter((item) => !idsJaAgendados.has(String(item.idDisponibilidade)));
    }, [disponibilidades, registros]);

    const formatKg = (value) => {
        const digitos = value.replace(/\D/g, "").slice(0, 7);
        if (!digitos) return "";
        return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    };

    const formatNome = (value) => value.replace(/[^a-zA-ZÀ-ÿ ]/g, "");
    const formatEmpresa = (value) => String(value || "").toUpperCase().slice(0, 80);
    const formatFrota = (value) => String(value || "").toUpperCase().slice(0, 40);

    const formatPlaca = (value) => {
        const caracteres = value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 7);
        if (!caracteres) return "";
        return caracteres.toUpperCase();
    };

    const formatCpf = (value) => {
        const cpff = value.replace(/\D/g, "").slice(0, 11);
        if (!cpff) return "";
        return cpff
            .replace(/(\d{3})(\d)/, "$1.$2")
            .replace(/(\d{3})(\d)/, "$1.$2")
            .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    };

    const formatCombustivel = (value) => {
        const digitos = value.replace(/\D/g, "").slice(0, 6);
        if (!digitos) return "";
        return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    };

    const formatFrete = (value) => {
        // Remove tudo exceto dígitos e virgula/ponto
        let cleaned = value.replace(/[^0-9.,]/g, '');
        
        // Substitui ponto por virgula (padrão PT-BR)
        cleaned = cleaned.replace(/\./g, ',');
        
        // Se tiver mais de uma virgula, remove as extras mantendo só a última
        const parts = cleaned.split(',');
        if (parts.length > 2) {
            cleaned = parts[0].replace(/,/g, '') + ',' + parts[parts.length - 1];
        }
        
        // Separa inteiro e decimal
        const [inteiro = '', decimal = ''] = cleaned.split(',');
        
        // Formata com separador de milhar (ponto) e decimal (virgula)
        const inteiroFormatado = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        
        if (decimal) {
            return inteiroFormatado + ',' + decimal.slice(0, 2);
        }
        
        return inteiroFormatado;
    };

    useEffect(() => {
        const carregarDisponibilidades = async () => {
            try {
                setCarregandoDisponibilidades(true);
                const response = await fetch(`${API_BASE_URL}/logistica/disponibilidades`, {
                    headers: {
                        "x-user-type": tipoHeader
                    }
                });
                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    throw new Error(data.error || "Falha ao carregar disponibilidades.");
                }

                setDisponibilidades(Array.isArray(data.disponibilidades) ? data.disponibilidades : []);
            } catch (error) {
                alert(`Erro ao carregar disponibilidades: ${error.message}`);
            } finally {
                setCarregandoDisponibilidades(false);
            }
        };

        carregarDisponibilidades();

        const handleDataUpdated = () => {
            carregarDisponibilidades();
        };
        window.addEventListener('gct:data-updated', handleDataUpdated);

        const intervalId = setInterval(() => {
            carregarDisponibilidades();
        }, AUTO_REFRESH_MS);

        return () => {
            clearInterval(intervalId);
            window.removeEventListener('gct:data-updated', handleDataUpdated);
        };
    }, [API_BASE_URL, tipoHeader]);

    useEffect(() => {
        localStorage.setItem(STORAGE_FORM_KEY, JSON.stringify(formData));
    }, [formData]);

    useEffect(() => {
        localStorage.setItem(STORAGE_REGISTROS_KEY, JSON.stringify(registros));
    }, [registros]);

    const obterDestinoPorDisponibilidade = (idDisponibilidade) => {
        const encontrado = disponibilidades.find((item) => item.idDisponibilidade === idDisponibilidade);
        return encontrado?.destino || "";
    };

    const handleChangeDisponibilidade = (idDisponibilidade, setState) => {
        const destino = obterDestinoPorDisponibilidade(idDisponibilidade);
        setState((prev) => ({
            ...prev,
            disponibilidade: idDisponibilidade,
            destino
        }));
    };

    const handleRegistrar = () => {
        if (!formData.disponibilidade || !formData.cpf || !formData.nome || !formData.empresa || !formData.placa || !formData.capacidade || !formData.destino || !formData.combustivel || !formData.frete) {
            alert("Preencha todos os campos!");
            return;
        }

        if (formData.tipoFrota === "FROTA" && !formData.frota) {
            alert("Informe a frota quando o item possuir frota.");
            return;
        }

        const jaAgendado = registros.some((registro) => String(registro.disponibilidade) === String(formData.disponibilidade));
        if (jaAgendado) {
            alert("Esta disponibilidade já foi agendada e está pendente de envio.");
            return;
        }

        const agora = new Date();

            const novoRegistro = {
                id: formData.disponibilidade,
            ...formData,
            criadoEm: agora.toLocaleString("pt-BR"),
                status: "AGE"
        };

        setRegistros([...registros, novoRegistro]);
        setFormData(estadoInicialForm);
        setFeedback("Agendamento registrado com sucesso!");
        setTimeout(() => setFeedback(""), 3000);
    };

    const handleAbrirEdicao = (registro) => {
        setEditando(registro.id);
        setFormEdicao({
            disponibilidade: registro.disponibilidade,
            tipoFrota: registro.tipoFrota || (registro.frota ? "FROTA" : "TERCEIRO"),
            frota: registro.frota || "",
            cpf: registro.cpf,
            nome: registro.nome,
            empresa: registro.empresa,
            placa: registro.placa,
            capacidade: registro.capacidade,
            destino: registro.destino,
            combustivel: registro.combustivel,
            frete: registro.frete
        });
    };

    const handleCancelarEdicao = () => {
        setEditando(null);
        setFormEdicao(estadoInicialForm);
    };

    const handleSalvarEdicao = () => {
        if (!formEdicao.disponibilidade || !formEdicao.cpf || !formEdicao.nome || !formEdicao.empresa || !formEdicao.placa || !formEdicao.capacidade || !formEdicao.destino || !formEdicao.combustivel || !formEdicao.frete) {
            alert("Preencha todos os campos!");
            return;
        }

        if (formEdicao.tipoFrota === "FROTA" && !formEdicao.frota) {
            alert("Informe a frota quando o item possuir frota.");
            return;
        }

        setRegistros(registros.map((reg) =>
            reg.id === editando
                ? {
                    ...reg,
                    tipoFrota: formEdicao.tipoFrota || "TERCEIRO",
                    frota: formEdicao.tipoFrota === "FROTA" ? formEdicao.frota : "TERCEIRO",
                    cpf: formEdicao.cpf,
                    nome: formEdicao.nome,
                    empresa: formEdicao.empresa,
                    placa: formEdicao.placa,
                    capacidade: formEdicao.capacidade,
                    destino: reg.destino,
                    combustivel: formEdicao.combustivel,
                    frete: formEdicao.frete
                }
                : reg
        ));

        setEditando(null);
        alert("Registro atualizado com sucesso!");
    };

    const handleRemover = (id) => {
        const ok = confirm("Deseja realmente remover este registro?");
        if (!ok) return;
        setRegistros(registros.filter((reg) => reg.id !== id));
    };

    const handleEnviarTodos = async () => {
        if (registros.length === 0) {
            alert("Não há registros para enviar!");
            return;
        }

        if (enviando) return;

        const ok = confirm(`Deseja enviar ${registros.length} registro(s)?`);
        if (!ok) return;

        try {
            setEnviando(true);
            const response = await fetch(`${API_BASE_URL}/logistica/enviar`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-user-type": tipoHeader
                },
                body: JSON.stringify({ registros })
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                const detalhes = [
                    data.error,
                    data.detail,
                    Array.isArray(data.notFoundIds) && data.notFoundIds.length > 0
                        ? `IDs não encontrados: ${data.notFoundIds.join(", ")}`
                        : null
                ].filter(Boolean).join(" | ");

                throw new Error(detalhes || "Falha ao enviar registros da logística.");
            }

            alert(`Registros enviados com sucesso! (${data.updated || registros.length})`);
            setRegistros([]);
            setFormData(estadoInicialForm);
            localStorage.removeItem(STORAGE_REGISTROS_KEY);
            window.dispatchEvent(new Event('gct:data-updated'));
        } catch (error) {
            alert(`Erro ao enviar logística: ${error.message}`);
        } finally {
            setEnviando(false);
        }
    };

    return (
        <div className="case-logistic">

            <h2>NOVO AGENDAMENTO</h2>

            <label>
                DISPONIBILIDADE:
                <select
                    value={formData.disponibilidade}
                    onChange={e => handleChangeDisponibilidade(e.target.value, setFormData)}
                    onKeyDown={e => {if (e.key === "Enter") {cpfRef.current.focus();}}}
                    disabled={carregandoDisponibilidades}
                >
                    <option value="">
                        {carregandoDisponibilidades
                            ? "CARREGANDO..."
                            : disponibilidadesDisponiveis.length === 0
                                ? "Sem disponibilidades pendentes"
                                : "Selecione uma disponibilidade"}
                    </option>
                    {disponibilidadesDisponiveis.map((item) => (
                        <option
                            key={item.idDisponibilidade}
                            value={item.idDisponibilidade}
                        >
                            {`${item.idDisponibilidade} | ZONA ${item.zona || "SEM ZONA"} | FAZENDA: ${item.destino || "SEM FAZENDA"}`}
                        </option>
                    ))}
                </select>
            </label> 

            <label>
                O ITEM POSSUI FROTA?
                <select
                    value={formData.tipoFrota}
                    onChange={(e) => setFormData((prev) => ({
                        ...prev,
                        tipoFrota: e.target.value,
                        frota: e.target.value === "FROTA" ? prev.frota : ""
                    }))}
                >
                    <option value="TERCEIRO">NÃO (TERCEIRO)</option>
                    <option value="FROTA">SIM (FROTA)</option>
                </select>
            </label>

            {formData.tipoFrota === "FROTA" && (
            <label>
                FROTA:
                <input
                    type="text"
                    maxLength={MAX_INPUT_LENGTH}
                    placeholder="EX: FROTA 01"
                    value={formData.frota}
                    onChange={(e) => setFormData({ ...formData, frota: formatFrota(e.target.value) })}
                />
            </label>
            )}

            <label>
                CPF:
                <input 
                type="text"
                maxLength={MAX_INPUT_LENGTH}
                placeholder="APENAS NUMEROS"
                ref={cpfRef}
                value={formData.cpf}
                onChange={(e) => setFormData({ ...formData, cpf: formatCpf(e.target.value) })}
                onKeyDown={e => {if (e.key === "Enter") {nomeRef.current.focus();}}}
                />
            </label>

            <label>
                NOME MOTORISTA:
                <input 
                type="text"
                maxLength={MAX_INPUT_LENGTH}
                placeholder="APENAS LETRAS"
                ref={nomeRef}
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: formatNome(e.target.value).toUpperCase() })}
                onKeyDown={e => {if (e.key === "Enter") {empresaRef.current.focus();}}}
                />
            </label>

            <label>
                CNPJ OU NOME DA EMPRESA:
                <input
                type="text"
                maxLength={MAX_INPUT_LENGTH}
                placeholder="EX: AGT TRANSPORTES"
                ref={empresaRef}
                value={formData.empresa}
                onChange={(e) => setFormData({ ...formData, empresa: formatEmpresa(e.target.value) })}
                onKeyDown={e => {if (e.key === "Enter") {placaRef.current.focus();}}}
                />
            </label>
            
            <label>
                PLACA:
                <input 
                type="text"
                maxLength={MAX_INPUT_LENGTH}
                placeholder="Ex: ABC1234"
                ref={placaRef}
                value={formData.placa}
                onChange={(e) => setFormData({ ...formData, placa: formatPlaca(e.target.value) })}
                onKeyDown={e => {if (e.key === "Enter") {capacidadeRef.current.focus();}}}
                />
            </label>

            <label>
                CAPACIDADE MÁXIMA (KG):
                <input 
                type="text"
                maxLength={MAX_INPUT_LENGTH}
                ref={capacidadeRef}
                value={formData.capacidade}
                placeholder="Ex: 3,000 kg"
                onKeyDown={e => {if (e.key === "Enter") {destinoRef.current.focus();}}}
                onChange={(e) => setFormData({ ...formData, capacidade: formatKg(e.target.value) })}
                />
            </label>

            <label>
                DESTINO:
                <input 
                type="text"
                maxLength={MAX_INPUT_LENGTH}
                ref={destinoRef}
                value={formData.destino}
                placeholder="AUTOMATICO"
                readOnly
                onKeyDown={e => {if (e.key === "Enter") {combustivelRef.current.focus();}}}
                />
            </label>

            <label>
                COMBUSTIVEL (LITROS):
                <input 
                type="text"
                maxLength={MAX_INPUT_LENGTH}
                ref={combustivelRef}
                value={formData.combustivel}
                placeholder="APENAS NUMEROS"
                onChange={e => setFormData({ ...formData, combustivel: formatCombustivel(e.target.value) })}
                onKeyDown={e => {if (e.key === "Enter") {freteRef.current.focus();}}}
                />
            </label>

            <label>
                FRETE (R$):
                <input 
                type="text"
                maxLength={MAX_INPUT_LENGTH}
                ref={freteRef}
                value={formData.frete}
                placeholder="R$ 0,00"
                onChange={(e) => setFormData({ ...formData, frete: formatFrete(e.target.value) })}
                onKeyDown={e => {if (e.key === "Enter") btnRef.current.click();}}
                />
            </label>

            <button className="btn-agendar" ref={btnRef} onClick={handleRegistrar}>
                AGENDAR
            </button>
            {feedback && <p className="feedback-msg">{feedback}</p>}

            {registros.length > 0 && (
                <div className="registros-lista">
                    <h3>Registros Pendentes ({registros.length})</h3>

                    {registros.map((registro) => (
                        <div key={registro.id} className="registro-card">
                            <div 
                                className="registro-info"
                                onClick={() => handleAbrirEdicao(registro)}
                                style={{ cursor: 'pointer' }}
                            >
                            <span><strong>{registro.id}</strong></span>
                            <span>DISPONIBILIDADE: {registro.disponibilidade}</span>
                            <span>TIPO: {registro.tipoFrota || "TERCEIRO"}</span>
                            <span>FROTA: {(registro.tipoFrota || "TERCEIRO") === "FROTA" ? (registro.frota || "-") : "TERCEIRO"}</span>
                            <span>CPF: {registro.cpf}</span>
                            <span>NOME: {registro.nome}</span>
                            <span>EMPRESA: {registro.empresa}</span>
                            <span>PLACA: {registro.placa}</span>
                            <span>CAPACIDADE: {registro.capacidade}</span>
                            <span>DESTINO: {registro.destino}</span>
                            <span>COMBUSTIVEL: {registro.combustivel}</span>
                            <span>FRETE: {registro.frete}</span>
                            <span>CRIADO EM: {registro.criadoEm}</span>
                            <span className="status-badge-age">STATUS: AGE</span>
                        </div>

                        <button className="btn-remover" onClick={(e) => {e.stopPropagation(); handleRemover(registro.id);}}>
                            ✕
                        </button>
                </div>
            ))}
            <button className="btn-enviar" onClick={handleEnviarTodos} disabled={enviando}>
                {enviando ? "ENVIANDO..." : `ENVIAR TODOS ${registros.length}`}
            </button>
        </div>
        )}

        {/* Modal de Edição */}
        {editando && (
            <div className="modal-overlay" onClick={handleCancelarEdicao}>
                <div className="modal-content" onClick={e => e.stopPropagation()}>
                    <h2>Editar Registro</h2>
                    <p className="modal-id">ID: {editando}</p>

                    <label>
                        DISPONIBILIDADE:
                        <input
                            type="text"
                            maxLength={MAX_INPUT_LENGTH}
                            value={formEdicao.disponibilidade}
                            readOnly
                            disabled
                        />
                    </label>

                    <label>
                        O ITEM POSSUI FROTA?
                        <select
                            value={formEdicao.tipoFrota || "TERCEIRO"}
                            onChange={e => setFormEdicao({
                                ...formEdicao,
                                tipoFrota: e.target.value,
                                frota: e.target.value === "FROTA" ? formEdicao.frota : ""
                            })}
                        >
                            <option value="TERCEIRO">NÃO (TERCEIRO)</option>
                            <option value="FROTA">SIM (FROTA)</option>
                        </select>
                    </label>

                    {(formEdicao.tipoFrota || "TERCEIRO") === "FROTA" && (
                    <label>
                        FROTA:
                        <input
                            type="text"
                            maxLength={MAX_INPUT_LENGTH}
                            value={formEdicao.frota || ""}
                            placeholder="EX: FROTA 01"
                            onChange={e => setFormEdicao({ ...formEdicao, frota: formatFrota(e.target.value) })}
                        />
                    </label>
                    )}

                    <label>
                        CPF:
                        <input
                            type="text"
                            maxLength={MAX_INPUT_LENGTH}
                            value={formEdicao.cpf}
                            onChange={e => setFormEdicao({...formEdicao, cpf: formatCpf(e.target.value)})}
                        />
                    </label>

                    <label>
                        NOME MOTORISTA:
                        <input
                            type="text"
                            maxLength={MAX_INPUT_LENGTH}
                            value={formEdicao.nome}
                            onChange={e => setFormEdicao({...formEdicao, nome: formatNome(e.target.value).toUpperCase()})}
                        />
                    </label>

                    <label>
                        CNPJ OU NOME DA EMPRESA:
                        <input
                            type="text"
                            maxLength={MAX_INPUT_LENGTH}
                            value={formEdicao.empresa}
                            onChange={e => setFormEdicao({...formEdicao, empresa: formatEmpresa(e.target.value)})}
                        />
                    </label>

                    <label>
                        PLACA:
                        <input
                            type="text"
                            maxLength={MAX_INPUT_LENGTH}
                            value={formEdicao.placa}
                            onChange={e => setFormEdicao({...formEdicao, placa: formatPlaca(e.target.value).toUpperCase()})}
                        />
                    </label>

                    <label>
                        CAPACIDADE (KG):
                        <input
                            type="text"
                            maxLength={MAX_INPUT_LENGTH}
                            value={formEdicao.capacidade}
                            onChange={e => setFormEdicao({...formEdicao, capacidade: formatKg(e.target.value)})}
                        />
                    </label>

                    <label>
                        DESTINO:
                        <input
                            type="text"
                            maxLength={MAX_INPUT_LENGTH}
                            value={formEdicao.destino}
                            readOnly
                        />
                    </label>

                    <label>
                        COMBUSTÍVEL (L):
                        <input
                            type="text"
                            maxLength={MAX_INPUT_LENGTH}
                            value={formEdicao.combustivel}
                            onChange={e => setFormEdicao({...formEdicao, combustivel: formatCombustivel(e.target.value)})}
                        />
                    </label>

                    <label>
                        FRETE (R$):
                        <input
                            type="text"
                            maxLength={MAX_INPUT_LENGTH}
                            value={formEdicao.frete}
                            onChange={e => setFormEdicao({...formEdicao, frete: formatFrete(e.target.value)})}
                        />
                    </label>

                    <div className="modal-buttons">
                        <button className="btn-cancelar" onClick={handleCancelarEdicao}>CANCELAR</button>
                        <button className="btn-salvar" onClick={handleSalvarEdicao}>SALVAR</button>
                    </div>
                </div>
            </div>
        )}
    </div>
    );
}
