import { useEffect, useMemo, useRef, useState } from "react"
import "./carregamento.css"

const STORAGE_FORM_KEY = "carregamento_formData_v1";
const STORAGE_REGISTROS_KEY = "carregamento_registros_v1";
const AUTO_REFRESH_MS = 15000;
const MAX_INPUT_LENGTH = 100;

const estadoInicialForm = {
    disponibilidade: "",
    talhoes: "",
    peso: "",
    fotos: []
};

export default function Carregamento({ currentUser }) {
    const API_BASE_URL = import.meta.env.VITE_API_URL || "https://variables-etc-basketball-catalyst.trycloudflare.com";
    const tipoHeader = String(currentUser?.TIPO || currentUser?.tipo || "").trim().toUpperCase();
    const MAX_AGENDAMENTO_LENGTH = 20;
    const MAX_TALHOES_LENGTH = 50;

    const [feedback, setFeedback] = useState("");
    const [agendamentos, setAgendamentos] = useState([]);
    const [filtroBusca, setFiltroBusca] = useState("");
    const [carregandoAgendamentos, setCarregandoAgendamentos] = useState(false);

    // CRIANDO REFERENCIAS
    const pesoEstimado = useRef();
    const talhoesVirgula = useRef();
    const btnFinalizar = useRef();
    const fotosInputRef = useRef();
    const fotosModalInputRef = useRef();

    const [formData, setFormData] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_FORM_KEY);
            const parsed = saved ? JSON.parse(saved) : null;
            return parsed ? { ...estadoInicialForm, ...parsed, fotos: [] } : estadoInicialForm;
        } catch {
            return estadoInicialForm;
        }
    });

    // FORMATANDO CAMPO KG
    const formatKg = (value) => {
        const digitos = value.replace(/\D/g, "").slice(0, 7);
        if (!digitos) return "";
        return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    // FORMULARIO E MODAL
    const [mostrarModal, setMostrarModal] = useState(false);
    const [formModal, setFormModal] = useState({
        disponibilidade: "",
        talhoes: "",
        peso: "",
        fotos: []
    });

    // lista de registros (apontamentos) e estado de edição
    const [registros, setRegistros] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_REGISTROS_KEY);
            const parsed = saved ? JSON.parse(saved) : [];
            if (!Array.isArray(parsed)) return [];
            return parsed.map((item) => ({ ...item, fotos: [] }));
        } catch {
            return [];
        }
    });
    const [editando, setEditando] = useState(null);

    const fileToBase64 = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error(`Falha ao converter arquivo: ${file?.name || 'imagem'}`));
        reader.readAsDataURL(file);
    });

    const converterFotosParaBase64 = async (fotos) => {
        const arquivos = Array.isArray(fotos) ? fotos : [];
        if (arquivos.length === 0) return [];
        const base64List = await Promise.all(arquivos.map((arquivo) => fileToBase64(arquivo)));
        return base64List.filter(Boolean);
    }

    const limitarTalhoes = (value) => String(value || '').slice(0, MAX_TALHOES_LENGTH);
    const limitarAgendamento = (value) => String(value || '').slice(0, MAX_AGENDAMENTO_LENGTH);

    const handleFotosChange = (files, setState) => {
        const fotosSelecionadas = Array.from(files || []);
        setState(prev => {
            const fotosAtuais = Array.isArray(prev.fotos) ? prev.fotos : [];
            const fotosCombinadas = [...fotosAtuais, ...fotosSelecionadas];
            if (fotosCombinadas.length > 2) {
                alert('Permitido no máximo 2 fotos por registro.');
            }
            return { ...prev, fotos: fotosCombinadas.slice(0, 2) };
        });
    }

    useEffect(() => {
        const carregarAgendamentos = async () => {
            try {
                setCarregandoAgendamentos(true);
                const response = await fetch(`${API_BASE_URL}/carregamento/agendamentos`, {
                    headers: { 'x-user-type': tipoHeader }
                });
                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    throw new Error(data.error || "Falha ao carregar agendamentos AGE.");
                }

                setAgendamentos(Array.isArray(data.agendamentos) ? data.agendamentos : []);
            } catch (error) {
                alert(`Erro ao carregar agendamentos: ${error.message}`);
            } finally {
                setCarregandoAgendamentos(false);
            }
        };

        carregarAgendamentos();

        const handleDataUpdated = () => {
            carregarAgendamentos();
        };
        window.addEventListener('gct:data-updated', handleDataUpdated);

        const intervalId = setInterval(() => {
            carregarAgendamentos();
        }, AUTO_REFRESH_MS);

        return () => {
            clearInterval(intervalId);
            window.removeEventListener('gct:data-updated', handleDataUpdated);
        };
    }, [API_BASE_URL, tipoHeader]);

    useEffect(() => {
        const payload = { ...formData, fotos: [] };
        localStorage.setItem(STORAGE_FORM_KEY, JSON.stringify(payload));
    }, [formData]);

    useEffect(() => {
        const payload = registros.map((item) => ({ ...item, fotos: [] }));
        localStorage.setItem(STORAGE_REGISTROS_KEY, JSON.stringify(payload));
    }, [registros]);

    const limparCamposArquivo = () => {
        if (fotosInputRef.current) fotosInputRef.current.value = "";
        if (fotosModalInputRef.current) fotosModalInputRef.current.value = "";
    }

    const resetarCarregamento = () => {
        setRegistros([]);
        setFormData(estadoInicialForm);
        setFormModal(estadoInicialForm);
        setMostrarModal(false);
        setEditando(null);
        setFeedback("");
        setFiltroBusca("");
        localStorage.removeItem(STORAGE_FORM_KEY);
        localStorage.removeItem(STORAGE_REGISTROS_KEY);
        limparCamposArquivo();
    }

    const agendamentosDisponiveis = useMemo(() => {
        const idsJaApontados = new Set(registros.map((registro) => String(registro.disponibilidade)));
        return agendamentos.filter((item) => !idsJaApontados.has(String(item.idDisponibilidade)));
    }, [agendamentos, registros]);

    const agendamentosFiltrados = agendamentosDisponiveis.filter((item) => {
        const termo = filtroBusca.trim().toLowerCase();
        if (!termo) return true;

        const alvo = [
            item.idDisponibilidade,
            item.cnpj,
            item.empresa,
            item.zona,
            item.unidade,
            item.destino
        ].filter(Boolean).join(' ').toLowerCase();

        return alvo.includes(termo);
    });


    // ações utilitárias
    function handleCancelarEdicao() {
        setEditando(null);
        setMostrarModal(false);
    }

    async function handleEnviarTodos() {
        if (registros.length === 0) {
            alert('Não há registros para enviar!');
            return;
        }

        const ok = confirm(`Deseja enviar ${registros.length} registro(s)?`);
        if (!ok) return;

        try {
            const registrosPayload = await Promise.all(
                registros.map(async (registro) => {
                    const talhoesLista = String(registro.talhoes || '')
                        .split(',')
                        .map((item) => item.trim())
                        .filter(Boolean);

                    const fotosBase64 = await converterFotosParaBase64(registro.fotos || []);

                    return {
                        disponibilidade: registro.disponibilidade,
                        talhoes: talhoesLista.join(', '),
                        pesoEstimado: String(registro.peso || '').trim(),
                        fotosBase64
                    };
                })
            );

            const response = await fetch(`${API_BASE_URL}/carregamento/enviar`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-type': tipoHeader
                },
                body: JSON.stringify({ registros: registrosPayload })
            });

            const rawBody = await response.text();
            let data = {};
            try {
                data = rawBody ? JSON.parse(rawBody) : {};
            } catch {
                data = {};
            }

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    data.detail ||
                    `Falha ao enviar carregamentos para o banco (HTTP ${response.status}). ${rawBody || response.statusText || ''}`
                );
            }

            if (Array.isArray(data.notFoundIds) && data.notFoundIds.length > 0) {
                alert(`Enviado com sucesso, mas ${data.notFoundIds.length} ID(s) não foram encontrados no banco.`);
            } else {
                alert(`Registros enviados com sucesso! Total: ${data.updated || registros.length}`);
            }

            resetarCarregamento();
            window.dispatchEvent(new Event('gct:data-updated'));
        } catch (error) {
            alert(`Erro ao enviar carregamentos: ${error.message}`);
        }
    }


    // abre o modal com os valores atuais para confirmação (ou edição)
    function handleRegistrar() {
        if (!formData.disponibilidade || !formData.talhoes || !formData.peso) {
            alert('Preencha todos os campos!');
            return;
        }

        const jaApontado = registros.some((registro) => String(registro.disponibilidade) === String(formData.disponibilidade));
        if (jaApontado) {
            alert('Este agendamento já foi apontado e está pendente de envio.');
            return;
        }

        const novoRegistro = {
            id: formData.disponibilidade,
            disponibilidade: formData.disponibilidade,
            talhoes: formData.talhoes,
            peso: formData.peso,
            fotos: formData.fotos,
            criadoEm: new Date().toLocaleString('pt-BR'),
            status: 'CGA'
        };

        setRegistros([...registros, novoRegistro]);
        setFormData(estadoInicialForm);
        setEditando(null);
        limparCamposArquivo();

        setFeedback('Agendamento registrado com sucesso!');
        setTimeout(() => setFeedback(''), 3000);
    }
    
    function handleConfirmarFinalizacao() {
        const novoRegistro = {
            id: formModal.disponibilidade,
            disponibilidade: formModal.disponibilidade,
            talhoes: formModal.talhoes,
            peso: formModal.peso,
            fotos: formModal.fotos,
            criadoEm: new Date().toLocaleString('pt-BR'),
            status: 'CGA'
        };
        setRegistros([...registros, novoRegistro]);
        setMostrarModal(false);
        setFormData(estadoInicialForm);
        setEditando(null);

        setFeedback('Agendamento registrado com sucesso!');
        setTimeout(() => setFeedback(''), 3000);
    }

    function handleAbrirEdicao(reg) {
        setEditando(reg.id);
        setFormModal({
            disponibilidade: reg.disponibilidade,
            talhoes: reg.talhoes,
            peso: reg.peso,
            fotos: reg.fotos || []
        });
        setMostrarModal(true);
    }

    function handleSalvarEdicao() {
        setRegistros(registros.map(r => {
            if (r.id !== editando) return r;
            return {
                ...r,
                talhoes: formModal.talhoes,
                peso: formModal.peso,
                fotos: formModal.fotos || []
            };
        }));
        setMostrarModal(false);
        setEditando(null);
        setFormData(estadoInicialForm);
    }

    function handleRemover(id) {
        const ok = confirm('Deseja realmente remover este registro?');
        if (!ok) return;
        setRegistros(registros.filter(r => r.id !== id));
    }

    return (
        <>
            <div className="loader">
                <h2>REGISTRAR CARREGAMENTO</h2>

                <label>
                    PESQUISA (CNPJ/EMPRESA/ZONA/UNIDADE):
                    <input
                        type="text"
                        maxLength={MAX_INPUT_LENGTH}
                        placeholder="Digite CNPJ, empresa, zona ou unidade"
                        value={filtroBusca}
                        onChange={(e) => setFiltroBusca(e.target.value.toUpperCase())}
                    />
                </label>

                <label>
                    AGENDAMENTOS:
                    <select
                        maxLength={MAX_AGENDAMENTO_LENGTH}
                        value={formData.disponibilidade}
                        onChange={e => {setFormData(prev => ({ ...prev, disponibilidade: limitarAgendamento(e.target.value) }));}}
                        onKeyDown={e => {if (e.key === "Enter") {talhoesVirgula.current.focus();}}}
                        disabled={carregandoAgendamentos}
                    >
                        <option value="">
                            {carregandoAgendamentos
                                ? "CARREGANDO..."
                                : agendamentosFiltrados.length === 0
                                    ? "Sem agendamentos pendentes"
                                    : "Selecione um agendamento AGE"}
                        </option>
                        {agendamentosFiltrados.map((item) => (
                            <option
                                key={item.idDisponibilidade}
                                value={item.idDisponibilidade}
                            >
                                {`${item.idDisponibilidade} | UNIDADE ${item.unidade || 'SEM UNIDADE'} | ZONA ${item.zona || 'SEM ZONA'} | EMPRESA: ${item.empresa || item.cnpj || 'SEM EMPRESA'} | FAZENDA: ${item.destino || 'SEM FAZENDA'}`}
                            </option>
                        ))}
                    </select>
                </label>
                
                <label>
                    TALHÕES SEPARADOS POR VIRGULA:
                    <input type="text"
                    ref={talhoesVirgula}
                    maxLength={MAX_INPUT_LENGTH}
                    value={formData.talhoes}
                    placeholder="Ex: 1AO20, 1AO21"
                    onChange={e => setFormData({ ...formData, talhoes: limitarTalhoes(e.target.value) })}
                    onKeyDown={e => {if (e.key === "Enter") {pesoEstimado.current.focus();}}}
                    ></input>
                </label>

                <label>
                    PESO ESTIMADO (KG):
                    <input type="text"
                    maxLength={MAX_INPUT_LENGTH}
                    ref={pesoEstimado}
                    value={formData.peso}
                    placeholder="APENAS NUMEROS"
                    onKeyDown={e => {if (e.key === "Enter") {btnFinalizar.current.focus();}}}
                    onChange={(e) => setFormData({ ...formData, peso: formatKg(e.target.value) })}
                    ></input>
                </label>

                <label>
                    FOTOS (ATÉ 2 FOTOS):
                    <input
                        ref={fotosInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => handleFotosChange(e.target.files, setFormData)}
                    />
                </label>

                <button className="btn-carregamento" ref={btnFinalizar} onClick={handleRegistrar}>
                    FINALIZAR CARREGAMENTO
                </button>

                {feedback && <p className="feedback-msg">{feedback}</p>}
                {registros.length > 0 && (
                    <div className="registros-lista">
                        <h3>Registros Pendentes ({registros.length})</h3>

                        {registros.map((registro) =>(
                            <div key={registro.id} className="registro-card">
                                <div 
                                    className="registro-info"
                                    onClick={() => handleAbrirEdicao(registro)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <span><strong>{registro.id}</strong></span>
                                    <span>DISPONIBILIDADE: {registro.disponibilidade}</span>
                                    <span>TALHÕES: {registro.talhoes}</span>
                                    <span>PESO: {registro.peso}</span>
                                    <span>FOTOS: {registro.fotos?.length || 0}</span>
                                    <span>CRIADO EM: {registro.criadoEm}</span>
                                    <span className="status-badge-cga">STATUS:  {registro.status || 'CGA'}</span>

                                </div>
                                <button className="btn-remover" onClick={(e) => {e.stopPropagation(); handleRemover(registro.id);}}>
                                    ✕
                                </button>
                            </div>
                        ))}
                        <button className="btn-enviar" onClick={handleEnviarTodos}>ENVIAR TODOS {registros.length}</button>
                    </div>
                )}

                {/* modal de confirmação / edição reutilizável */}
                {mostrarModal && (
                    <div className="modal-overlay" onClick={() => { setMostrarModal(false); setEditando(null); }}>
                        <div className="modal-content" onClick={e => e.stopPropagation()}>
                            <h2>{editando ? 'Editar Carregamento' : 'Finalizar Carregamento'}</h2>

                            <label>
                                AGENDAMENTOS:
                                <input
                                    type="text"
                                    maxLength={MAX_INPUT_LENGTH}
                                    value={formModal.disponibilidade}
                                    readOnly
                                    disabled
                                />
                            </label>

                            <label>
                                TALHÕES SEPARADOS POR VIRGULA:
                                <input
                                    type="text"
                                    maxLength={MAX_INPUT_LENGTH}
                                    value={formModal.talhoes}
                                    onChange={e => setFormModal({...formModal, talhoes: limitarTalhoes(e.target.value)})}
                                />
                            </label>

                            <label>
                                PESO ESTIMADO (KG):
                                <input
                                    type="text"
                                    maxLength={MAX_INPUT_LENGTH}
                                    value={formModal.peso}
                                    onChange={e => setFormModal({...formModal, peso: e.target.value})}
                                />
                            </label>

                            <label>
                                FOTOS:
                                <input
                                    ref={fotosModalInputRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={(e) => handleFotosChange(e.target.files, setFormModal)}
                                />
                            </label>

                            <div className="modal-buttons">
                                <button className="btn-cancelar" onClick={() => { setMostrarModal(false); setEditando(null); }}>CANCELAR</button>
                                <button className="btn-salvar" onClick={editando ? handleSalvarEdicao : handleConfirmarFinalizacao}>
                                    {editando ? 'SALVAR' : 'CONFIRMAR'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    )
}