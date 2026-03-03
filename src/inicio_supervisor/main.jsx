import "./inicio.css"
import LogisticaPage from "./logistica/logistica.jsx"
import { useEffect, useMemo, useState, useRef } from "react";
import Carregamento from "./carregamento/carregamento.jsx"
import Controladoria from "./controladoria/controladoria.jsx";


export default function Inicio({ onExit, currentUser }) {

    const MAX_INPUT_LENGTH = 100;

    const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://population-copy-government-decade.trycloudflare.com';
    const APONTAMENTO_TABLE = import.meta.env.VITE_APONTAMENTO_TABLE || 'QUALIDADE.GESTAO_CARGAS_TRANSPORTE';

    const fazendaRef = useRef();
    const zonaRef = useRef();
    const estoqueInicialRef = useRef();
    const estoqueDiaRef = useRef();



    const [selected, setSelected] = useState("");

    const nomeUsuario = currentUser?.NOME || currentUser?.nome || 'USUÁRIO';
    const tipoUsuario = currentUser?.TIPO || currentUser?.tipo || 'NÃO INFORMADO';
    const tipoHeader = String(tipoUsuario || '').trim().toUpperCase();
    const tipoAcesso = String(tipoUsuario || '').trim().toUpperCase();

    const modulosPermitidos = useMemo(() => {
        if (tipoAcesso === 'ADMIN') {
            return ['APONTAMENTO', 'LOGISTICA', 'CARREGAMENTO', 'CONTROLADORIA'];
        }
        if (tipoAcesso === 'SUPERVISOR') {
            return ['PROCESSO_UNICO', 'APONTAMENTO', 'LOGISTICA'];
        }
        if (tipoAcesso === 'LOGISTICA') {
            return ['LOGISTICA'];
        }
        if (tipoAcesso === 'CARREGAMENTO') {
            return ['CARREGAMENTO'];
        }
        if (tipoAcesso === 'CONTROLADORIA') {
            return ['CONTROLADORIA'];
        }
        return [];
    }, [tipoAcesso]);

    useEffect(() => {
        if (modulosPermitidos.length === 0) {
            setSelected('');
            return;
        }

        if (!modulosPermitidos.includes(selected)) {
            setSelected(modulosPermitidos[0]);
        }
    }, [modulosPermitidos, selected]);

    const podeAcessar = (modulo) => modulosPermitidos.includes(modulo);
    
    // helper para formatar valores em kg com separador de milhar
    const formatKg = (value) => {
        // remove quaisquer caracteres não-dígitos
        const digits = value.replace(/\D/g, "");
        if (!digits) return "";
        // adiciona vírgula como separador de milhar (por exemplo 3,000)
        return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    };

    const parseKg = (value = "") => Number(String(value).replace(/\D/g, "")) || 0;

    const formatTotalKg = (num = 0) => {
        return Number(num).toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    };

    const calcularTotalKg = (estoqueInicial, estoqueDia) =>
        formatTotalKg(String(parseKg(estoqueInicial) + parseKg(estoqueDia)));

    const UnidadeFormat = (value) => {
        const digitos = value.replace(/\D/g, "").slice(0, 3);
        return digitos;
    }

    const ZonaFormat = (value) => {
        const digitos = value.replace(/\D/g, "");
        return digitos;
    }

    const zona = useRef();
    const estoqueInicial = useRef();
    const estoqueDia = useRef();

    // Estado para armazenar os registros
    const [registros, setRegistros] = useState([]);
    const [enviando, setEnviando] = useState(false);
    
    // Estado para os campos do formulário
    const [formData, setFormData] = useState({
        unidade: '',
        fazenda: '',
        zona: '',
        estoqueInicial: '',
        estoqueDia: '',
        estoqueTotal: ''
    });

    // Estado para controlar a edição
    const [editando, setEditando] = useState(null);
    const [formEdicao, setFormEdicao] = useState({
        unidade: '',
        fazenda: '',
        zona: '',
        estoqueInicial: '',
        estoqueDia: '',
        estoqueTotal: ''
    });

    // Função para adicionar um novo registro
    const handleRegistrar = () => {
        if (!formData.unidade || !formData.fazenda || !formData.zona || !formData.estoqueInicial || !formData.estoqueDia) {
            alert('Preencha todos os campos!');
            return;
        }

        const idDisponibilidade = `DIS-${new Date().getFullYear()}-${formData.unidade}-${Math.floor(10000 + Math.random() * 90000)}`;

        const novoRegistro = {
            id: idDisponibilidade,
            unidade: formData.unidade,
            fazenda: formData.fazenda,
            zona: formData.zona,
            estoqueInicial: formData.estoqueInicial,
            estoqueDia: formData.estoqueDia,
            estoqueTotal: calcularTotalKg(formData.estoqueInicial, formData.estoqueDia),
            criadoEm: new Date().toLocaleString('pt-BR'),
            status: 'DIS'
        };

        setRegistros([...registros, novoRegistro]);
        
        // Limpa o formulário
        setFormData({
            unidade: '',
            fazenda: '',
            zona: '',
            estoqueInicial: '',
            estoqueDia: '',
            estoqueTotal: ''
        });

        alert('Registro adicionado! Adicione mais ou clique em ENVIAR TODOS.');
    };

    // Função para abrir modal de edição
    const handleAbrirEdicao = (registro) => {
        setEditando(registro.id);
        setFormEdicao({
            unidade: registro.unidade,
            fazenda: registro.fazenda,
            zona: registro.zona,
            estoqueInicial: registro.estoqueInicial,
            estoqueDia: registro.estoqueDia,
            estoqueTotal: registro.estoqueTotal



        });
    };

    // Função para salvar edição
    const handleSalvarEdicao = () => {
        if (!formEdicao.unidade || !formEdicao.fazenda || !formEdicao.zona || !formEdicao.estoqueInicial || !formEdicao.estoqueDia) {
            alert('Preencha todos os campos!');
            return;
        }

        setRegistros(registros.map(reg => 
            reg.id === editando 
                ? {
                    ...reg,
                    unidade: formData.unidade,
                    fazenda: formEdicao.fazenda,
                    zona: formEdicao.zona,
                    estoqueInicial: formEdicao.estoqueInicial,
                    estoqueDia: formEdicao.estoqueDia,
                    estoqueTotal: formEdicao.estoqueTotal
                  }
                : reg
        ));

        setEditando(null);
        alert('Registro atualizado com sucesso!');
    };

    // Função para cancelar edição
    const handleCancelarEdicao = () => {
        setEditando(null);
        setFormEdicao({
            unidade: '',
            fazenda: '',
            zona: '',
            estoqueInicial: '',
            estoqueDia: '',
            estoqueTotal: ''
        });
    };

    // Função para remover um registro
    const handleRemover = (id) => {
        const ok = confirm('Deseja realmente remover este registro?');
        if (!ok) return;
        setRegistros(registros.filter(reg => reg.id !== id));
    };

    // Função para enviar todos os registros
    const handleEnviarTodos = async () => {
        if (registros.length === 0) {
            alert('Não há registros para enviar!');
            return;
        }

        if (enviando) return;

        const ok = confirm(`Deseja enviar ${registros.length} registro(s)?`);
        if (!ok) return;

        try {
            setEnviando(true);
            const response = await fetch(`${API_BASE_URL}/apontamento/enviar`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-type': tipoHeader
                },
                body: JSON.stringify({
                    registros,
                    ...(APONTAMENTO_TABLE ? { tableSpec: APONTAMENTO_TABLE } : {})
                })
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                const detalhes = [
                    data.error,
                    data.detail,
                    data.table ? `Tabela: ${data.table}` : null,
                    Array.isArray(data.missingColumns) && data.missingColumns.length > 0
                        ? `Colunas ausentes: ${data.missingColumns.join(', ')}`
                        : null,
                    Array.isArray(data.requiredMissing) && data.requiredMissing.length > 0
                        ? `Obrigatórias sem valor: ${data.requiredMissing.map(c => c.name).join(', ')}`
                        : null,
                    Array.isArray(data.paramIssues) && data.paramIssues.length > 0
                        ? `Parâmetros inválidos: ${data.paramIssues.map(p => `${p.column} (${p.issue})`).join(', ')}`
                        : null
                ].filter(Boolean).join(' | ');

                throw new Error(detalhes || 'Falha ao enviar registros para o banco.');
            }

            alert(`Registros enviados com sucesso! (${data.inserted || registros.length})`);
            setRegistros([]);
            window.dispatchEvent(new Event('gct:data-updated'));
        } catch (error) {
            alert(`Erro ao enviar para o banco: ${error.message}`);
        } finally {
            setEnviando(false);
        }
    };
    
    /////////////////////////////
    return (
        <>
        <aside className="sideBar">
            <div className="headSidebar">
                <img 
                    src="/src/assets/logo_inicio.png"
                    className="logo"
                />
                
                <button
                    className="btnExit"
                    onClick={() => {
                        const ok = confirm('Tem certeza que deseja sair?');
                        if (!ok) return;
                        alert('Saindo e voltando para a tela de login');
                        if (onExit) onExit();
                    }}
                >
                    Sair
                </button>
            </div>
            
            <div className="btnFunctions">
                {podeAcessar('APONTAMENTO') && (
                <button onClick={() => setSelected('APONTAMENTO')}>
                    APONTAMENTO
                </button>
                )}

                {podeAcessar('LOGISTICA') && (
                <button onClick={() => setSelected('LOGISTICA')}>
                    LOGÍSTICA
                </button>
                )}

                {podeAcessar('CARREGAMENTO') && (
                <button onClick={() => setSelected('CARREGAMENTO')}>
                    CARREGAMENTO
                </button>
                )}

                {podeAcessar('CONTROLADORIA') && (
                <button onClick={() => setSelected('CONTROLADORIA')}>
                    CONTROLADORIA
                </button>
                )}

                {podeAcessar('PROCESSO_UNICO') && (
                <button onClick={() => {
                    const ok = confirm('Tem certeza que deseja iniciar o fluxo completo (Apontamento + Logística + Carregamento)?');
                    if (!ok) return;
                    setSelected('PROCESSO_UNICO');
                }}>
                    PROCESSO ÚNICO (APONTAMENTO + LOGÍSTICA + CARREGAMENTO)
                </button>
                )}
            </div>

            <div className="sidebarUserFooter">
                <div className="sidebarUserName">{nomeUsuario}</div>
                <div className="sidebarUserType">TIPO: {tipoUsuario}</div>
            </div>
        </aside>

        <div className="stepPanel">
            {modulosPermitidos.length === 0 && <p>USUÁRIO SEM MÓDULOS LIBERADOS. VERIFIQUE O TIPO DE ACESSO.</p>}
            {modulosPermitidos.length > 0 && selected === '' && <p>ESCOLHA UMA OPÇÃO DISPONIVEL</p>}

            {selected === 'PROCESSO_UNICO' && podeAcessar('PROCESSO_UNICO') && (
                <div className="step-processo-unico">
                    <h2>PROCESSO ÚNICO - SUPERVISOR</h2>

                    <div className="step-content">
                        <h2>NOVA DISPONIBILIDADE</h2>
                        <label>
                            UNIDADE:
                            <input type="text"
                                maxLength={MAX_INPUT_LENGTH}
                                placeholder="Ex: 112, 115 ou 127"
                                value={formData.unidade}
                                onKeyDown={ e => {if (e.key === "Enter") {fazendaRef.current.focus();}}}
                                onChange={(e) => setFormData({...formData, unidade: UnidadeFormat(e.target.value)})}
                            />
                        </label>

                        <label>
                            DESTINO:
                            <input 
                                type="text" 
                                maxLength={MAX_INPUT_LENGTH}
                                pattern="[A-Za-zÀ-ÿ ]*"
                                title="Somente letras"
                                placeholder="Ex: Tiese **SOMENTE LETRAS**"
                                value={formData.fazenda}
                                onChange={(e) => setFormData({...formData, fazenda: e.target.value.toUpperCase()})}
                                ref = {fazendaRef}  
                                onKeyDown={e => { if (e.key === "Enter") {zonaRef.current.focus();}}}
                                onKeyPress={e => {
                                    const char = String.fromCharCode(e.which);
                                    if (!/[A-Za-zÀ-ÿ ]/.test(char)) {
                                        e.preventDefault();
                                    }
                                }}
                            />
                        </label>

                        <label>
                            ZONA:
                            <input 
                                type="text" 
                                placeholder="Ex: 1234   "
                                ref={zonaRef}
                                value={formData.zona}
                                onKeyDown={e => {if (e.key === "Enter") {estoqueInicialRef.current.focus();}}}
                                onChange={(e) => setFormData({...formData, zona: ZonaFormat(e.target.value)})}
                            />
                        </label>

                        <label>
                            ESTOQUE INICIAL (KG):
                            <input 
                                type="text" 
                                maxLength={MAX_INPUT_LENGTH}
                                placeholder="Ex: 3,000"
                                value={formData.estoqueInicial}
                                ref={estoqueInicialRef}
                                onKeyDown={e => {if (e.key === "Enter") {estoqueDiaRef.current.focus();}}}
                                onChange={(e) => setFormData({...formData, estoqueInicial: formatKg(e.target.value)})}
                            />
                        </label>

                        <label>
                            ESTOQUE DO DIA (KG):
                            <input 
                                type="text" 
                                maxLength={MAX_INPUT_LENGTH}
                                placeholder="Ex: 3,000"
                                ref={estoqueDiaRef}
                                value={formData.estoqueDia}
                                onChange={(e) => setFormData({...formData, estoqueDia: formatKg(e.target.value)})}
                            />
                        </label>

                        <label>
                            SALDO TOTAL (KG):
                            <input 
                                type="text"
                                maxLength={MAX_INPUT_LENGTH}
                                value={calcularTotalKg(formData.estoqueInicial, formData.estoqueDia)}
                                readOnly
                            >
                            </input>
                        </label>

                        <button className="submit-btn" onClick={handleRegistrar}>
                            REGISTRAR
                        </button>

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
                                            <span>UNIDADE: {registro.unidade}</span>
                                            <span>DESTINO: {registro.fazenda}</span>
                                            <span>ZONA: {registro.zona}</span>
                                            <span>SALDO TOTAL: {registro.estoqueTotal} KG</span>
                                            <span>CRIADO EM: {registro.criadoEm}</span>
                                            <span className="status-badge-dis">STATUS: DIS</span>
                                        </div>
                                        <button 
                                            className="btn-remover"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleRemover(registro.id);
                                            }}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}

                                <button className="enviar-todos-btn" onClick={handleEnviarTodos} disabled={enviando}>
                                    {enviando ? 'ENVIANDO...' : `ENVIAR TODOS (${registros.length})`}
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="step-logistica">
                        <LogisticaPage currentUser={currentUser} />
                    </div>

                    <div className="step-carregamento">
                        <Carregamento currentUser={currentUser} />
                    </div>
                </div>
            )}
            
            {selected === 'APONTAMENTO' && podeAcessar('APONTAMENTO') && (
                <div className="step-content">
                    <h2>NOVA DISPONIBILIDADE</h2>
                    <label>
                        UNIDADE:
                        <input type="text"
                            maxLength={MAX_INPUT_LENGTH}
                            placeholder="Ex: 112, 115 ou 127"
                            value={formData.unidade}
                            onKeyDown={ e => {if (e.key === "Enter") {fazendaRef.current.focus();}}}
                            onChange={(e) => setFormData({...formData, unidade: UnidadeFormat(e.target.value)})}
                        />
                    </label>

                    <label>
                        DESTINO:
                        <input 
                            type="text" 
                            maxLength={MAX_INPUT_LENGTH}
                            pattern="[A-Za-zÀ-ÿ ]*"
                            title="Somente letras"
                            placeholder="Ex: Tiese **SOMENTE LETRAS**"
                            value={formData.fazenda}
                            onChange={(e) => setFormData({...formData, fazenda: e.target.value.toUpperCase()})}
                            ref = {fazendaRef}  
                            onKeyDown={e => { if (e.key === "Enter") {zonaRef.current.focus();}}}
                            onKeyPress={e => {
                                const char = String.fromCharCode(e.which);
                                if (!/[A-Za-zÀ-ÿ ]/.test(char)) {
                                    e.preventDefault();
                                }
                            }}
                        />
                    </label>

                    <label>
                        ZONA:
                        <input 
                            type="text" 
                            placeholder="Ex: 123"
                            ref={zonaRef}
                            value={formData.zona}
                            onKeyDown={e => {if (e.key === "Enter") {estoqueInicialRef.current.focus();}}}
                            onChange={(e) => setFormData({...formData, zona: ZonaFormat(e.target.value)})}
                        />
                    </label>

                    <label>
                        ESTOQUE INICIAL (KG):
                        <input 
                            type="text" 
                            maxLength={MAX_INPUT_LENGTH}
                            placeholder="Ex: 3,000"
                            value={formData.estoqueInicial}
                            ref={estoqueInicialRef}
                            onKeyDown={e => {if (e.key === "Enter") {estoqueDiaRef.current.focus();}}}
                            onChange={(e) => setFormData({...formData, estoqueInicial: formatKg(e.target.value)})}
                        />
                    </label>

                    <label>
                        ESTOQUE DO DIA (KG):
                        <input 
                            type="text" 
                            maxLength={MAX_INPUT_LENGTH}
                            placeholder="Ex: 3,000"
                            ref={estoqueDiaRef}
                            value={formData.estoqueDia}
                            onChange={(e) => setFormData({...formData, estoqueDia: formatKg(e.target.value)})}
                        />
                    </label>

                    <label>
                        SALDO TOTAL (KG):
                        <input 
                            type="text"
                            maxLength={MAX_INPUT_LENGTH}
                            value={calcularTotalKg(formData.estoqueInicial, formData.estoqueDia)}
                            readOnly
                        >
                        </input>
                    </label>




                    <button className="submit-btn" onClick={handleRegistrar}>
                        REGISTRAR
                    </button>

                    {/* Lista de registros */}
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
                                        <span>UNIDADE: {registro.unidade}</span>
                                        <span>DESTINO: {registro.fazenda}</span>
                                        <span>ZONA: {registro.zona}</span>
                                        <span>SALDO TOTAL: {registro.estoqueTotal} KG</span>
                                        <span>CRIADO EM: {registro.criadoEm}</span>
                                        <span className="status-badge-dis">STATUS: DIS</span>
                                    </div>
                                    <button 
                                        className="btn-remover"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemover(registro.id);
                                        }}
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}

                            <button className="enviar-todos-btn" onClick={handleEnviarTodos} disabled={enviando}>
                                {enviando ? 'ENVIANDO...' : `ENVIAR TODOS (${registros.length})`}
                            </button>
                        </div>
                    )}
                </div>
            )},

            {selected === 'LOGISTICA' && podeAcessar('LOGISTICA') && (
                <div className="step-logistica">
                    <LogisticaPage currentUser={currentUser} />
                </div>
            )},

            {selected === 'CARREGAMENTO' && podeAcessar('CARREGAMENTO') && (
                <div className="step-carregamento">
                    <Carregamento currentUser={currentUser} />
                </div>
            )},

            {selected === 'CONTROLADORIA' && podeAcessar('CONTROLADORIA') && (
                <div className="step-control">
                    <Controladoria currentUser={currentUser} />
                </div>
            )};
            
        </div>
        {/* Modal de Edição */}
        {editando && (
            <div className="modal-overlay" onClick={handleCancelarEdicao}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                    <h2>Editar Registro</h2>
                    <p className="modal-id">ID: {editando}</p>

                    <label>
                        DESTINO:
                        <input 
                            type="text" 
                            maxLength={MAX_INPUT_LENGTH}
                            pattern="[A-Za-zÀ-ÿ ]*"
                            title="Somente letras"
                            value={formEdicao.fazenda}
                            onChange={(e) => setFormEdicao({...formEdicao, fazenda: e.target.value})}
                            onKeyPress={e => {
                                const char = String.fromCharCode(e.which);
                                if (!/[A-Za-zÀ-ÿ ]/.test(char)) {
                                    e.preventDefault();
                                }
                            }}
                        />
                    </label>

                    <label>
                        ZONA:
                        <input 
                            type="text" 
                            value={formEdicao.zona}
                            onChange={(e) => setFormEdicao({...formEdicao, zona: ZonaFormat(e.target.value)})}
                        />
                    </label>

                    <label>
                        ESTOQUE INICIAL (KG):
                        <input 
                            type="text" 
                            maxLength={MAX_INPUT_LENGTH}
                            value={formEdicao.estoqueInicial}
                            onChange={(e) => setFormEdicao({...formEdicao, estoqueInicial: formatKg(e.target.value)})}
                        />
                    </label>

                    <label>
                        ESTOQUE DO DIA (KG):
                        <input 
                            type="text" 
                            maxLength={MAX_INPUT_LENGTH}
                            value={formEdicao.estoqueDia}
                            onChange={(e) => setFormEdicao({...formEdicao, estoqueDia: formatKg(e.target.value)})}
                        />
                    </label>

                    <div className="modal-buttons">
                        <button className="btn-cancelar" onClick={handleCancelarEdicao}>
                            CANCELAR
                        </button>
                        <button className="btn-salvar" onClick={handleSalvarEdicao}>
                            SALVAR
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    )
}