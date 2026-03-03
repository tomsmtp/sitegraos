// this file now runs a simple express API for login/testing
import express from 'express';
import cors from 'cors';
import odbc from 'odbc';
import dotenv from 'dotenv';

dotenv.config();

const APONTAMENTO_COLUMNS = [
  'IDDISPONIBILIDADE',
  'UNIDADE',
  'FAZENDA',
  'ZONA',
  'ESTOQUE_INICIAL',
  'COLHEITADIA',
  'SALDODISPONIVEL',
  'DATAREGISTRO',
  'STATUSDISP'
];

const app = express();
const corsOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (corsOrigins.length === 0) return callback(null, true);
    if (corsOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`Origin não permitida pelo CORS: ${origin}`));
  },
}));
app.use(express.json({ limit: '50mb' }));

async function getConnection() {
  const connStr = `DSN=${process.env.DB_DSN2};UID=${process.env.DB_USER2};PWD=${process.env.DB_PASS2}`;
  return odbc.connect(connStr);
}

async function getVisibleColumns(conn, schema, table) {
  const cols = await conn.query(
    `SELECT column_name, data_type, nullable, data_default, data_precision, data_scale, data_length
     FROM all_tab_columns
     WHERE owner = ?
       AND table_name = ?
     ORDER BY column_id`,
    [schema, table]
  );

  let metadata = cols
    .map(c => ({
      name: c.COLUMN_NAME || c.column_name,
      type: c.DATA_TYPE || c.data_type || null,
      nullable: c.NULLABLE || c.nullable || null,
      defaultValue: c.DATA_DEFAULT || c.data_default || null,
      precision: c.DATA_PRECISION || c.data_precision || null,
      scale: c.DATA_SCALE || c.data_scale || null,
      length: c.DATA_LENGTH || c.data_length || null
    }))
    .filter(c => Boolean(c.name));

  if (metadata.length === 0) {
    try {
      const sampleRows = await conn.query(`SELECT * FROM ${schema}.${table} FETCH FIRST 1 ROWS ONLY`);
      if (sampleRows.length > 0) {
        metadata = Object.keys(sampleRows[0] || {}).filter(Boolean).map(name => ({
          name,
          type: null,
          nullable: null,
          defaultValue: null,
          precision: null,
          scale: null,
          length: null
        }));
      }
    } catch {
      // ignore sample fallback errors and keep empty metadata list
    }
  }

  return metadata;
}

function normalizeName(name = '') {
  return String(name).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function parsePtBrNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const raw = String(value).trim();
  if (!raw) return null;

  if (raw.includes(',')) {
    const normalized = raw.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? null : parsed;
  }

  const onlyDigits = raw.replace(/[^0-9-]/g, '');
  if (!onlyDigits) return null;
  const parsed = Number(onlyDigits);
  return Number.isNaN(parsed) ? null : parsed;
}

function parsePtBrDateTimeToOracle(value) {
  if (!value) return null;

  const raw = String(value).trim();
  const oracleMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s(\d{2}):(\d{2}):(\d{2})$/);
  if (oracleMatch) return raw;

  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:,\s*(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;

  const [, dd, mm, yyyy, hh = '00', min = '00', ss = '00'] = match;
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

function parseNumberForDb(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isNaN(value) ? null : value;

  const raw = String(value).trim();
  if (!raw) return null;

  const parsedPtBr = parsePtBrNumber(raw);
  if (parsedPtBr !== null) return parsedPtBr;

  const onlyDigits = raw.replace(/\D/g, '');
  if (!onlyDigits) return null;
  const parsed = Number(onlyDigits);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseKgInteger(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Math.trunc(value);
  }

  const digits = String(value).replace(/\D/g, '');
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseSaldoTotal(value) {
  const parsed = parsePtBrNumber(value);
  if (parsed === null) return null;
  return Math.trunc(parsed);
}

function convertByDbType(value, dbType) {
  const type = String(dbType || '').toUpperCase();

  if (type.includes('NUMBER') || type.includes('FLOAT') || type.includes('DECIMAL') || type.includes('INTEGER')) {
    return parseNumberForDb(value);
  }

  if (type.includes('DATE') || type.includes('TIMESTAMP')) {
    return parsePtBrDateTimeToOracle(value);
  }

  if (value === null || value === undefined) return null;
  return String(value);
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function getUserTypeFromRequest(req) {
  return String(
    req.headers['x-user-type']
    || req.headers['x-tipo-usuario']
    || req.headers['x-user-role']
    || ''
  ).trim().toUpperCase();
}

function requireModuleAccess(allowedTypes = []) {
  const allowed = allowedTypes.map((item) => String(item).trim().toUpperCase());
  return (req, res, next) => {
    const userType = getUserTypeFromRequest(req);
    if (!userType) {
      return res.status(401).json({ error: 'Tipo de usuário não informado no header x-user-type.' });
    }
    if (userType === 'ADMIN') return next();
    if (!allowed.includes(userType)) {
      return res.status(403).json({ error: `Acesso negado para o módulo. Perfil atual: ${userType}.` });
    }
    return next();
  };
}

// login endpoint (validate email+senha)
app.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.sendStatus(400);
  try {
    const conn = await getConnection();

    // authenticate against correct column names (EMAIL and SENHA)
    const sql = `
      SELECT *
      FROM QUALIDADE.GESTAO_CARGAS_TRANSPORTE_USER
      WHERE email = ?
        AND senha = ?`;
    const results = await conn.query(sql, [email, senha]);

    // log sample row/columns for debugging
    if (results.length > 0) {
      console.log('login query returned columns', Object.keys(results[0]));
    }

    await conn.close();
    if (results.length === 1) {
      return res.json({ ok: true, user: results[0] });
    }
    res.sendStatus(401);
  } catch (err) {
    console.error('login error', err);
    res.sendStatus(500);
  }
});

// inspection helper
app.get('/inspect/:spec', async (req, res) => {
  const spec = req.params.spec.toUpperCase();
  try {
    const conn = await getConnection();
    let schema, table;
    if (spec.includes('.')) {
      [schema, table] = spec.split('.');
      const rows = await conn.query(`SELECT * FROM ${schema}.${table} FETCH FIRST 5 ROWS ONLY`);
      await conn.close();
      return res.json({ schema, table, rows: rows.length });
    }
    const sch = await conn.query(`SELECT table_name FROM all_tables WHERE owner='${spec}' AND ROWNUM<=5`);
    if (sch.length > 0) {
      await conn.close();
      return res.json({ type: 'schema', name: spec, tables: sch.map(r => r.TABLE_NAME || r.table_name) });
    }
    const ownerRes = await conn.query(`SELECT owner FROM all_tables WHERE table_name='${spec}'`);
    await conn.close();
    if (ownerRes.length === 0) {
      return res.json({ type: 'missing', name: spec });
    }
    schema = ownerRes[0].OWNER || ownerRes[0].owner;
    const rows = await conn.query(`SELECT * FROM ${schema}.${spec} FETCH FIRST 5 ROWS ONLY`);
    return res.json({ type: 'table', schema, table: spec, rows: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// list available columns for a table (SPEC can be SCHEMA.TABLE or TABLE)
app.get('/inspect-columns/:spec', async (req, res) => {
  const spec = req.params.spec.toUpperCase();
  let conn;
  try {
    conn = await getConnection();

    let schema;
    let table;

    if (spec.includes('.')) {
      [schema, table] = spec.split('.');
    } else {
      table = spec;
      const ownerRes = await conn.query(
        `SELECT owner FROM all_tables WHERE table_name = ? FETCH FIRST 1 ROWS ONLY`,
        [table]
      );
      if (ownerRes.length === 0) {
        await conn.close();
        return res.status(404).json({ error: `Tabela não encontrada: ${table}` });
      }
      schema = ownerRes[0].OWNER || ownerRes[0].owner;
    }

    const cols = await conn.query(
      `SELECT column_name, data_type, data_length, nullable, column_id
       FROM all_tab_columns
       WHERE owner = ?
         AND table_name = ?
       ORDER BY column_id`,
      [schema, table]
    );

    await conn.close();

    return res.json({
      schema,
      table,
      total: cols.length,
      columns: cols.map((c) => ({
        name: c.COLUMN_NAME || c.column_name,
        type: c.DATA_TYPE || c.data_type,
        length: c.DATA_LENGTH || c.data_length,
        nullable: (c.NULLABLE || c.nullable) === 'Y'
      }))
    });
  } catch (err) {
    if (conn) {
      try { await conn.close(); } catch {}
    }
    return res.status(500).json({ error: err.message });
  }
});

// validate if expected APONTAMENTO columns exist in DB table
app.get('/validate-apontamento-columns/:spec', async (req, res) => {
  const spec = req.params.spec.toUpperCase();
  let conn;
  try {
    conn = await getConnection();

    let schema;
    let table;

    if (spec.includes('.')) {
      [schema, table] = spec.split('.');
    } else {
      table = spec;
      const ownerRes = await conn.query(
        `SELECT owner FROM all_tables WHERE table_name = ? FETCH FIRST 1 ROWS ONLY`,
        [table]
      );
      if (ownerRes.length === 0) {
        await conn.close();
        return res.status(404).json({ error: `Tabela não encontrada: ${table}` });
      }
      schema = ownerRes[0].OWNER || ownerRes[0].owner;
    }

    const cols = await conn.query(
      `SELECT column_name
       FROM all_tab_columns
       WHERE owner = ?
         AND table_name = ?`,
      [schema, table]
    );

    await conn.close();

    const dbColumns = cols.map(c => (c.COLUMN_NAME || c.column_name || '').toUpperCase());
    const missing = APONTAMENTO_COLUMNS.filter(col => !dbColumns.includes(col));
    const found = APONTAMENTO_COLUMNS.filter(col => dbColumns.includes(col));
    const extras = dbColumns.filter(col => !APONTAMENTO_COLUMNS.includes(col));

    return res.json({
      schema,
      table,
      expected: APONTAMENTO_COLUMNS,
      found,
      missing,
      extras,
      ok: missing.length === 0
    });
  } catch (err) {
    if (conn) {
      try { await conn.close(); } catch {}
    }
    return res.status(500).json({ error: err.message });
  }
});

// fetch disponibilidades for logistics dropdown
app.get('/logistica/disponibilidades', requireModuleAccess(['SUPERVISOR', 'LOGISTICA']), async (req, res) => {
  let conn;
  try {
    conn = await getConnection();

    const pick = (row, keys) => {
      for (const key of keys) {
        if (row[key] !== undefined && row[key] !== null) return row[key];
      }
      return null;
    };

    const rows = await conn.query(
      `SELECT
          ID_DISPONIBILIDADE AS ID_DISPONIBILIDADE_VALOR,
          FAZENDA AS FAZENDA_VALOR,
          TRIM(ZONA) AS ZONA_VALOR,
          STATUS_DISP AS STATUS_DISP_VALOR,
          DATA_REGISTRO AS DATA_REGISTRO_VALOR
       FROM QUALIDADE.GESTAO_CARGAS_TRANSPORTE
       WHERE UPPER(TRIM(STATUS_DISP)) IN ('DIS', 'DISP')
         AND ID_DISPONIBILIDADE IS NOT NULL
       ORDER BY DATA_REGISTRO DESC`
    );

    await conn.close();

    const disponibilidades = rows.map((row) => ({
      idDisponibilidade: String(pick(row, ['ID_DISPONIBILIDADE_VALOR', 'id_disponibilidade_valor', 'ID_DISPONIBILIDADE', 'id_disponibilidade']) || ''),
      destino: String(pick(row, ['FAZENDA_VALOR', 'fazenda_valor', 'FAZENDA', 'fazenda']) || ''),
      zona: String(pick(row, ['ZONA_VALOR', 'zona_valor', 'ZONA', 'zona']) || ''),
      status: String(pick(row, ['STATUS_DISP_VALOR', 'status_disp_valor', 'STATUS_DISP', 'status_disp']) || ''),
      dataRegistro: pick(row, ['DATA_REGISTRO_VALOR', 'data_registro_valor', 'DATA_REGISTRO', 'data_registro']) || null
    })).filter((item) => item.idDisponibilidade);

    return res.json({
      total: disponibilidades.length,
      disponibilidades
    });
  } catch (err) {
    if (conn) {
      try { await conn.close(); } catch {}
    }
    return res.status(500).json({ error: err.message });
  }
});

// fetch agendamentos for carregamento dropdown (AGE only)
app.get('/carregamento/agendamentos', requireModuleAccess(['CARREGAMENTO', 'SUPERVISOR']), async (req, res) => {
  let conn;
  try {
    conn = await getConnection();

    const rows = await conn.query(
      `SELECT *
       FROM QUALIDADE.GESTAO_CARGAS_TRANSPORTE
       WHERE UPPER(TRIM(STATUS_DISP)) = 'AGE'
         AND ID_DISPONIBILIDADE IS NOT NULL
       ORDER BY DATA_REGISTRO DESC`
    );

    await conn.close();

    const agendamentos = rows
      .map((row) => ({
        idDisponibilidade: String(row.ID_DISPONIBILIDADE || row.id_disponibilidade || '').trim(),
        status: String(row.STATUS_DISP || row.status_disp || '').trim(),
        zona: String(row.ZONA || row.zona || '').trim(),
        destino: String(row.FAZENDA || row.fazenda || '').trim(),
        unidade: String(row.UNIDADE || row.unidade || '').trim(),
        empresa: String(row.EMPRESA || row.empresa || '').trim(),
        cnpj: String(row.CNPJ || row.cnpj || '').trim(),
        dataRegistro: row.DATA_REGISTRO || row.data_registro || null
      }))
      .filter((item) => item.idDisponibilidade);

    return res.json({ total: agendamentos.length, agendamentos });
  } catch (err) {
    if (conn) {
      try { await conn.close(); } catch {}
    }
    return res.status(500).json({ error: err.message });
  }
});

// update carregamento fields from AGE records
app.post('/carregamento/enviar', requireModuleAccess(['CARREGAMENTO', 'SUPERVISOR']), async (req, res) => {
  const registros = Array.isArray(req.body?.registros) ? req.body.registros : [];
  if (registros.length === 0) {
    return res.status(400).json({ error: 'Nenhum registro informado.' });
  }

  let conn;
  try {
    conn = await getConnection();

    const dbColumnsMeta = await getVisibleColumns(conn, 'QUALIDADE', 'GESTAO_CARGAS_TRANSPORTE');
    const dbMetaByColumn = new Map(
      dbColumnsMeta.map(c => [String(c.name).toUpperCase(), c])
    );

    const notFoundIds = [];
    let updated = 0;
    const validationIssues = [];

    for (const registro of registros) {
      const idDisponibilidade = String(registro.disponibilidade || '').trim();
      if (!idDisponibilidade) continue;

      const existe = await conn.query(
        `SELECT ID_DISPONIBILIDADE
         FROM QUALIDADE.GESTAO_CARGAS_TRANSPORTE
         WHERE ID_DISPONIBILIDADE = ?
         FETCH FIRST 1 ROWS ONLY`,
        [idDisponibilidade]
      );

      if (!Array.isArray(existe) || existe.length === 0) {
        notFoundIds.push(idDisponibilidade);
        continue;
      }

      const talhoesLista = Array.isArray(registro.talhoesLista)
        ? registro.talhoesLista
        : String(registro.talhoes || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);

      const talhoesValor = talhoesLista.join(', ');
      const pesoEstimado = hasValue(registro.pesoEstimado)
        ? String(registro.pesoEstimado).trim()
        : (hasValue(registro.peso) ? String(registro.peso).trim() : null);

      const fotosBase64Lista = Array.isArray(registro.fotosBase64)
        ? registro.fotosBase64.filter((item) => hasValue(item)).map((item) => String(item))
        : [];
      const fotosValor = fotosBase64Lista.length > 0 ? JSON.stringify(fotosBase64Lista) : null;

      const talhoesMeta = dbMetaByColumn.get('TALHOES');
      const pesoMeta = dbMetaByColumn.get('PESO_ESTIMADO');
      const fotosMeta = dbMetaByColumn.get('FOTOS');
      const talhoesType = String(talhoesMeta?.type || '').toUpperCase();
      const pesoType = String(pesoMeta?.type || '').toUpperCase();
      const fotosType = String(fotosMeta?.type || '').toUpperCase();

      const talhoesMax = Number(talhoesMeta?.length || 0);
      const pesoMax = Number(pesoMeta?.length || 0);
      const fotosMax = Number(fotosMeta?.length || 0);

      if (!talhoesType.includes('CLOB') && !talhoesType.includes('NCLOB') && !talhoesType.includes('BLOB') && Number.isFinite(talhoesMax) && talhoesMax > 0 && typeof talhoesValor === 'string' && talhoesValor.length > talhoesMax) {
        validationIssues.push({
          idDisponibilidade,
          column: 'TALHOES',
          maxLength: talhoesMax,
          actualLength: talhoesValor.length,
          message: 'TALHOES excede o tamanho permitido no banco.'
        });
      }

      if (!pesoType.includes('CLOB') && !pesoType.includes('NCLOB') && !pesoType.includes('BLOB') && Number.isFinite(pesoMax) && pesoMax > 0 && typeof pesoEstimado === 'string' && pesoEstimado.length > pesoMax) {
        validationIssues.push({
          idDisponibilidade,
          column: 'PESO_ESTIMADO',
          maxLength: pesoMax,
          actualLength: pesoEstimado.length,
          message: 'PESO_ESTIMADO excede o tamanho permitido no banco.'
        });
      }

      if (!fotosType.includes('CLOB') && !fotosType.includes('NCLOB') && !fotosType.includes('BLOB') && Number.isFinite(fotosMax) && fotosMax > 0 && typeof fotosValor === 'string' && fotosValor.length > fotosMax) {
        validationIssues.push({
          idDisponibilidade,
          column: 'FOTOS',
          maxLength: fotosMax,
          actualLength: fotosValor.length,
          fotosQuantidade: fotosBase64Lista.length,
          message: 'FOTOS em Base64 excede o tamanho permitido no banco. Reduza quantidade/tamanho das imagens ou aumente a coluna FOTOS.'
        });
      }

      if (validationIssues.length > 0) {
        continue;
      }

      await conn.query(
        `UPDATE QUALIDADE.GESTAO_CARGAS_TRANSPORTE
         SET TALHOES = ?,
             PESO_ESTIMADO = ?,
             FOTOS = ?,
             STATUS_DISP = 'CGA'
         WHERE ID_DISPONIBILIDADE = ?`,
        [
          talhoesValor,
          pesoEstimado,
          fotosValor,
          idDisponibilidade
        ]
      );

      updated += 1;
    }

    await conn.close();

    if (validationIssues.length > 0) {
      return res.status(400).json({
        error: 'Falha de validação ao enviar carregamento.',
        detail: 'Alguns campos excedem o tamanho das colunas no banco.',
        validationIssues,
        updated,
        notFoundIds
      });
    }

    return res.json({
      ok: true,
      updated,
      notFoundIds
    });
  } catch (err) {
    if (conn) {
      try { await conn.close(); } catch {}
    }
    const odbcDetails = Array.isArray(err?.odbcErrors)
      ? err.odbcErrors.map(e => `${e.state || ''} ${e.code || ''} ${e.message || ''}`.trim()).join(' | ')
      : null;

    return res.status(500).json({
      error: err.message,
      detail: odbcDetails
    });
  }
});

// update logistics fields from agendamento records
app.post('/logistica/enviar', requireModuleAccess(['SUPERVISOR', 'LOGISTICA']), async (req, res) => {
  const registros = Array.isArray(req.body?.registros) ? req.body.registros : [];
  if (registros.length === 0) {
    return res.status(400).json({ error: 'Nenhum registro informado.' });
  }

  let conn;
  try {
    conn = await getConnection();

    const notFoundIds = [];
    let updated = 0;

    for (const registro of registros) {
      const idDisponibilidade = String(registro.disponibilidade || '').trim();
      if (!idDisponibilidade) continue;
      const idDisponibilidadeAge = idDisponibilidade.startsWith('DIS-')
        ? idDisponibilidade.replace(/^DIS-/, 'AGE-')
        : idDisponibilidade;
      const tipoFrota = String(registro.tipoFrota || '').trim().toUpperCase();
      const valorFrota = tipoFrota === 'FROTA'
        ? String(registro.frota ?? '').trim()
        : 'TERCEIRO';

      const existe = await conn.query(
        `SELECT ID_DISPONIBILIDADE
         FROM QUALIDADE.GESTAO_CARGAS_TRANSPORTE
         WHERE ID_DISPONIBILIDADE = ?
         FETCH FIRST 1 ROWS ONLY`,
        [idDisponibilidade]
      );

      if (!Array.isArray(existe) || existe.length === 0) {
        notFoundIds.push(idDisponibilidade);
        continue;
      }

      await conn.query(
        `UPDATE QUALIDADE.GESTAO_CARGAS_TRANSPORTE
         SET CPF = ?,
             MOTORISTA = ?,
             EMPRESA = ?,
             FROTA = ?,
             PLACA = ?,
             CAPACIDADE_MAX = ?,
             DESTINO = ?,
             COMBUSTIVEL = ?,
             FRETE = ?,
             STATUS_DISP = 'AGE',
             ID_DISPONIBILIDADE = ?
         WHERE ID_DISPONIBILIDADE = ?`,
        [
          String(registro.cpf ?? '').trim(),
          String(registro.nome ?? '').trim(),
          String(registro.empresa ?? '').trim(),
          valorFrota,
          String(registro.placa ?? '').trim(),
          String(registro.capacidade ?? '').trim(),
          String(registro.destino ?? '').trim(),
          String(registro.combustivel ?? '').trim(),
          String(registro.frete ?? '').trim(),
          idDisponibilidadeAge,
          idDisponibilidade
        ]
      );

      updated += 1;
    }

    await conn.close();

    return res.json({
      ok: true,
      updated,
      notFoundIds
    });
  } catch (err) {
    if (conn) {
      try { await conn.close(); } catch {}
    }
    return res.status(500).json({ error: err.message });
  }
});

// controladoria: list all processes after carregamento
app.get('/controladoria/processos', requireModuleAccess(['CONTROLADORIA', 'SUPERVISOR']), async (req, res) => {
  let conn;
  try {
    conn = await getConnection();

    const rows = await conn.query(
      `SELECT *
       FROM QUALIDADE.GESTAO_CARGAS_TRANSPORTE
       WHERE UPPER(TRIM(STATUS_DISP)) IN ('DIS', 'AGE', 'CGA', 'DVG', 'FNL')
         AND ID_DISPONIBILIDADE IS NOT NULL
       ORDER BY DATA_REGISTRO DESC`
    );

    await conn.close();

    const anoAtual = new Date().getFullYear();
    const extractYear = (value) => {
      if (value === null || value === undefined) return null;

      if (value instanceof Date && Number.isFinite(value.getTime())) {
        return value.getFullYear();
      }

      const text = String(value).trim();
      if (!text) return null;

      const isoMatch = text.match(/^(\d{4})[-/]/);
      if (isoMatch) return Number(isoMatch[1]);

      const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (brMatch) return Number(brMatch[3]);

      const parsed = new Date(text);
      if (Number.isFinite(parsed.getTime())) return parsed.getFullYear();

      return null;
    };

    const processos = rows.map((row) => {
      const fotosRaw = row.FOTOS ?? row.fotos ?? row.FOTO ?? row.foto ?? null;
      let fotos = [];
      let fotosCount = 0;
      if (Array.isArray(fotosRaw)) {
        fotos = fotosRaw.filter((item) => hasValue(item)).map((item) => String(item).trim()).filter((item) => item.length > 0);
        fotosCount = fotos.length;
      } else if (hasValue(fotosRaw)) {
        const texto = String(fotosRaw).trim();
        try {
          const parsed = JSON.parse(texto);
          if (Array.isArray(parsed)) {
            fotos = parsed.filter((item) => hasValue(item)).map((item) => String(item).trim()).filter((item) => item.length > 0);
            fotosCount = fotos.length;
          } else {
            fotos = [String(parsed).trim()].filter((item) => item.length > 0);
            fotosCount = 1;
          }
        } catch {
          fotos = [texto];
          fotosCount = 1;
        }
      }

      return {
        id: String(row.ID_DISPONIBILIDADE || row.id_disponibilidade || '').trim(),
        unidade: String(row.UNIDADE || row.unidade || '').trim(),
        zona: String(row.ZONA || row.zona || '').trim(),
        fazenda: String(row.FAZENDA || row.fazenda || '').trim(),
        empresa: String(row.EMPRESA || row.empresa || '').trim(),
        cnpj: String(row.CNPJ || row.cnpj || '').trim(),
        motorista: String(row.MOTORISTA || row.motorista || '').trim(),
        placa: String(row.PLACA || row.placa || '').trim(),
        pesoEstimado: String(row.PESO_ESTIMADO || row.peso_estimado || '').trim(),
        pesoLiquido: String(row.PESO_LIQUIDO || row.peso_liquido || row.PESO_ESTIMADO || row.peso_estimado || '').trim(),
        pesoBruto: String(row.PESO_BRUTO || row.peso_bruto || '').trim(),
        tara: String(row.TARA || row.tara || '').trim(),
        tipoPesagem: String(row.TIPO_PESAGEM || row.tipo_pesagem || '').trim(),
        refugo: String(row.REFUGO || row.refugo || '').trim(),
        motivoDivergencia: String(row.MOTIVO_DIVERGENCIA || row.motivo_divergencia || '').trim(),
        observacao: String(row.OBSERVACAO || row.observacao || row.OBSERVACOES || row.observacoes || '').trim(),
        status: String(row.STATUS_DISP || row.status_disp || '').trim().toUpperCase(),
        criadoEm: String(row.DATA_REGISTRO || row.data_registro || '').trim(),
        anoRegistro: extractYear(row.DATA_REGISTRO || row.data_registro || null),
        fotos,
        fotosCount
      };
    }).filter((item) => item.id && item.anoRegistro === anoAtual)
      .map(({ anoRegistro, ...item }) => item);

    return res.json({ total: processos.length, processos });
  } catch (err) {
    if (conn) {
      try { await conn.close(); } catch {}
    }
    return res.status(500).json({ error: err.message });
  }
});

// controladoria: update/edit/divergencia/finalizar process
app.patch('/controladoria/processos/:id', requireModuleAccess(['CONTROLADORIA']), async (req, res) => {
  const idDisponibilidade = String(req.params.id || '').trim();
  const action = String(req.body?.action || 'editar').toLowerCase();
  if (!idDisponibilidade) {
    return res.status(400).json({ error: 'ID de disponibilidade inválido.' });
  }

  let conn;
  try {
    conn = await getConnection();

    const existe = await conn.query(
      `SELECT ID_DISPONIBILIDADE
       FROM QUALIDADE.GESTAO_CARGAS_TRANSPORTE
       WHERE ID_DISPONIBILIDADE = ?
       FETCH FIRST 1 ROWS ONLY`,
      [idDisponibilidade]
    );

    if (!Array.isArray(existe) || existe.length === 0) {
      await conn.close();
      return res.status(404).json({ error: 'Processo não encontrado na controladoria.' });
    }

    const dbColumnsMeta = await getVisibleColumns(conn, 'QUALIDADE', 'GESTAO_CARGAS_TRANSPORTE');
    const map = new Map();
    for (const col of dbColumnsMeta.map(c => c.name)) {
      map.set(normalizeName(col), col);
    }

    const colStatus = map.get('STATUSDISP') || 'STATUS_DISP';
    const colUnidade = map.get('UNIDADE');
    const colZona = map.get('ZONA');
    const colFazenda = map.get('FAZENDA');
    const colEmpresa = map.get('EMPRESA');
    const colCnpj = map.get('CNPJ');
    const colMotorista = map.get('MOTORISTA');
    const colPlaca = map.get('PLACA');
    const colPesoEstimado = map.get('PESOESTIMADO') || map.get('PESO_ESTIMADO');
    const colPesoLiquido = map.get('PESOLIQUIDO') || map.get('PESO_LIQUIDO');
    const colPesoBruto = map.get('PESOBRUTO') || map.get('PESO_BRUTO');
    const colTara = map.get('TARA');
    const colTipoPesagem = map.get('TIPOPESAGEM') || map.get('TIPO_PESAGEM');
    const colRefugo = map.get('REFUGO');
    const colMotivo = map.get('MOTIVODIVERGENCIA');
    const colObs = map.get('OBSERVACAO') || map.get('OBSERVACOES');

    const updates = [];
    const params = [];
    const usedColumns = new Set();

    const addUpdateIfPresent = (columnName, payloadKey) => {
      if (!columnName || usedColumns.has(columnName)) return;
      if (!Object.prototype.hasOwnProperty.call(req.body || {}, payloadKey)) return;

      updates.push(`${columnName} = ?`);
      params.push(req.body?.[payloadKey] === null || req.body?.[payloadKey] === undefined
        ? ''
        : String(req.body?.[payloadKey]).trim());
      usedColumns.add(columnName);
    };

    addUpdateIfPresent(colUnidade, 'unidade');
    addUpdateIfPresent(colZona, 'zona');
    addUpdateIfPresent(colFazenda, 'fazenda');
    addUpdateIfPresent(colEmpresa, 'empresa');
    addUpdateIfPresent(colCnpj, 'cnpj');
    addUpdateIfPresent(colMotorista, 'motorista');
    addUpdateIfPresent(colPlaca, 'placa');
    addUpdateIfPresent(colPesoEstimado, 'pesoEstimado');
    addUpdateIfPresent(colPesoLiquido, 'pesoLiquido');
    addUpdateIfPresent(colPesoBruto, 'pesoBruto');
    addUpdateIfPresent(colTara, 'tara');
    addUpdateIfPresent(colTipoPesagem, 'tipoPesagem');
    addUpdateIfPresent(colRefugo, 'refugo');
    addUpdateIfPresent(colMotivo, 'motivoDivergencia');
    addUpdateIfPresent(colObs, 'observacao');

    const registroAtualRows = await conn.query(
      `SELECT *
       FROM QUALIDADE.GESTAO_CARGAS_TRANSPORTE
       WHERE ID_DISPONIBILIDADE = ?
       FETCH FIRST 1 ROWS ONLY`,
      [idDisponibilidade]
    );
    const registroAtual = Array.isArray(registroAtualRows) && registroAtualRows.length > 0
      ? registroAtualRows[0]
      : {};

    const readCurrent = (...columnCandidates) => {
      for (const col of columnCandidates) {
        if (!col) continue;
        const exact = registroAtual[col];
        if (hasValue(exact)) return String(exact).trim();
        const lower = registroAtual[String(col).toLowerCase()];
        if (hasValue(lower)) return String(lower).trim();
      }
      return '';
    };

    const mergePayload = (payloadKey, currentValue) => {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, payloadKey)) {
        const incoming = req.body?.[payloadKey];
        return incoming === null || incoming === undefined ? '' : String(incoming).trim();
      }
      return currentValue;
    };

    const getFotosCount = (source) => {
      if (Array.isArray(source)) {
        return source.filter((item) => hasValue(item)).length;
      }
      if (!hasValue(source)) return 0;
      const texto = String(source).trim();
      try {
        const parsed = JSON.parse(texto);
        if (Array.isArray(parsed)) {
          return parsed.filter((item) => hasValue(item)).length;
        }
        return hasValue(parsed) ? 1 : 0;
      } catch {
        return hasValue(texto) ? 1 : 0;
      }
    };

    if (action === 'finalizar') {
      const camposObrigatorios = [
        { key: 'unidade', label: 'unidade', current: readCurrent(colUnidade, 'UNIDADE') },
        { key: 'zona', label: 'zona', current: readCurrent(colZona, 'ZONA') },
        { key: 'fazenda', label: 'fazenda', current: readCurrent(colFazenda, 'FAZENDA') },
        { key: 'empresa', label: 'empresa', current: readCurrent(colEmpresa, 'EMPRESA') },
        { key: 'motorista', label: 'motorista', current: readCurrent(colMotorista, 'MOTORISTA') },
        { key: 'placa', label: 'placa', current: readCurrent(colPlaca, 'PLACA') },
        { key: 'pesoEstimado', label: 'peso estimado', current: readCurrent(colPesoEstimado, 'PESO_ESTIMADO') },
        { key: 'pesoLiquido', label: 'peso liquido', current: readCurrent(colPesoLiquido, 'PESO_LIQUIDO') },
        { key: 'pesoBruto', label: 'peso bruto', current: readCurrent(colPesoBruto, 'PESO_BRUTO') },
        { key: 'tara', label: 'tara', current: readCurrent(colTara, 'TARA') },
        { key: 'tipoPesagem', label: 'tipo de pesagem', current: readCurrent(colTipoPesagem, 'TIPO_PESAGEM') },
        { key: 'refugo', label: 'refugo', current: readCurrent(colRefugo, 'REFUGO') }
      ];

      const pendentes = camposObrigatorios
        .filter((campo) => !hasValue(mergePayload(campo.key, campo.current)))
        .map((campo) => campo.label);

      const fotosFromPayload = Object.prototype.hasOwnProperty.call(req.body || {}, 'fotosBase64')
        ? req.body?.fotosBase64
        : (Object.prototype.hasOwnProperty.call(req.body || {}, 'fotos') ? req.body?.fotos : undefined);
      const fotosCountFinal = fotosFromPayload === undefined
        ? getFotosCount(readCurrent('FOTOS', 'FOTO'))
        : getFotosCount(fotosFromPayload);
      if (fotosCountFinal <= 0) {
        pendentes.push('fotos');
      }

      if (pendentes.length > 0) {
        await conn.close();
        return res.status(400).json({
          error: `Não é possível finalizar sem preencher todos os campos obrigatórios. Pendentes: ${pendentes.join(', ')}.`
        });
      }
    }

    let statusAlvo = null;
    if (action === 'divergencia') statusAlvo = 'DVG';
    if (action === 'finalizar') statusAlvo = 'FNL';
    if (!statusAlvo && hasValue(req.body?.status)) statusAlvo = String(req.body?.status).trim().toUpperCase();
    if (statusAlvo) {
      updates.push(`${colStatus} = ?`);
      params.push(statusAlvo);
    }

    if (updates.length === 0) {
      await conn.close();
      return res.json({
        ok: true,
        id: idDisponibilidade,
        action,
        message: 'Sem colunas opcionais disponíveis para atualização nesta tabela, processo mantido.'
      });
    }

    params.push(idDisponibilidade);

    await conn.query(
      `UPDATE QUALIDADE.GESTAO_CARGAS_TRANSPORTE
       SET ${updates.join(', ')}
       WHERE ID_DISPONIBILIDADE = ?`,
      params
    );

    await conn.close();

    return res.json({
      ok: true,
      id: idDisponibilidade,
      action,
      message: action === 'finalizar'
        ? 'Processo finalizado com sucesso!'
        : action === 'divergencia'
          ? 'Processo marcado com divergência.'
          : 'Processo atualizado com sucesso!'
    });
  } catch (err) {
    if (conn) {
      try { await conn.close(); } catch {}
    }
    return res.status(500).json({ error: err.message });
  }
});

// insert pending APONTAMENTO records into DB
app.post('/apontamento/enviar', requireModuleAccess(['SUPERVISOR']), async (req, res) => {
  const registros = Array.isArray(req.body?.registros) ? req.body.registros : [];
  if (registros.length === 0) {
    return res.status(400).json({ error: 'Nenhum registro informado.' });
  }

  const tableSpec = (req.body?.tableSpec || process.env.APONTAMENTO_TABLE || 'QUALIDADE.GESTAO_CARGAS_TRANSPORTE').toUpperCase();
  if (!/^[A-Z0-9_]+\.[A-Z0-9_]+$/.test(tableSpec)) {
    return res.status(400).json({ error: 'tableSpec inválido. Use apenas letras/números/underscore no formato SCHEMA.TABELA.' });
  }
  const [schema, table] = tableSpec.includes('.') ? tableSpec.split('.') : [null, tableSpec];

  if (!schema || !table) {
    return res.status(400).json({ error: 'tableSpec inválido. Use SCHEMA.TABELA.' });
  }

  let conn;
  try {
    conn = await getConnection();

    const dbColumnsMeta = await getVisibleColumns(conn, schema, table);
    const dbColumns = dbColumnsMeta.map(c => c.name);
    const dbTypesByColumn = new Map(
      dbColumnsMeta.map(c => [String(c.name).toUpperCase(), c.type])
    );
    const dbMetaByColumn = new Map(
      dbColumnsMeta.map(c => [String(c.name).toUpperCase(), c])
    );

    const map = new Map();
    for (const col of dbColumns) {
      map.set(normalizeName(col), col);
    }

    const frontendToDb = {
      id: map.get('IDDISPONIBILIDADE') || map.get('ID_DISPONIBILIDADE') || 'ID_DISPONIBILIDADE',
      unidade: map.get('UNIDADE') || 'UNIDADE',
      fazenda: map.get('FAZENDA') || 'FAZENDA',
      zona: map.get('ZONA') || 'ZONA',
      estoqueInicial: map.get('ESTOQUE_INICIAL') || 'ESTOQUE_INICIAL',
      estoqueDia: map.get('COLHEITADIA') || map.get('COLHEITA_DIA') || 'COLHEITA_DIA',
      estoqueTotal: map.get('SALDODISPONIVEL') || map.get('SALDO_DISPONIVEL') || 'SALDO_DISPONIVEL',
      criadoEm: map.get('DATAREGISTRO') || map.get('DATA_REGISTRO') || 'DATA_REGISTRO',
      status: map.get('STATUSDISP') || map.get('STATUS_DISP') || 'STATUS_DISP'
    };

    const missingColumns = dbColumns.length > 0
      ? Object.values(frontendToDb).filter(col => !dbColumns.includes(col))
      : [];

    if (dbColumns.length > 0 && missingColumns.length > 0) {
      await conn.close();
      return res.status(400).json({
        error: 'A tabela não possui todas as colunas esperadas para inserção.',
        missingColumns,
        table: `${schema}.${table}`
      });
    }

    if (dbColumnsMeta.length > 0) {
      const providedSet = new Set(Object.values(frontendToDb).map(col => String(col).toUpperCase()));
      const blockedRequiredColumns = dbColumnsMeta
        .filter(col =>
          String(col.nullable || '').toUpperCase() === 'N' &&
          !col.defaultValue &&
          !providedSet.has(String(col.name).toUpperCase())
        )
        .map(col => ({ name: col.name, type: col.type }));

      if (blockedRequiredColumns.length > 0) {
        await conn.close();
        return res.status(400).json({
          error: 'A tabela possui colunas obrigatórias sem valor no payload.',
          table: `${schema}.${table}`,
          requiredMissing: blockedRequiredColumns
        });
      }
    }

    for (const [index, registro] of registros.entries()) {
      const columns = [
        frontendToDb.id,
        frontendToDb.unidade,
        frontendToDb.fazenda,
        frontendToDb.zona,
        frontendToDb.estoqueInicial,
        frontendToDb.estoqueDia,
        frontendToDb.estoqueTotal,
        frontendToDb.criadoEm,
        frontendToDb.status
      ];

      const placeholders = columns.map((col) => {
        const colType = String(dbTypesByColumn.get(String(col).toUpperCase()) || '').toUpperCase();
        if (col === frontendToDb.criadoEm && (colType.includes('DATE') || colType.includes('TIMESTAMP'))) {
          if (colType.includes('TIMESTAMP')) return `TO_TIMESTAMP(?, 'YYYY-MM-DD HH24:MI:SS')`;
          return `TO_DATE(?, 'YYYY-MM-DD HH24:MI:SS')`;
        }
        return '?';
      }).join(', ');
      const sql = `INSERT INTO ${schema}.${table} (${columns.join(', ')}) VALUES (${placeholders})`;

      const valueByColumn = {
        [frontendToDb.id]: registro.id,
        [frontendToDb.unidade]: registro.unidade,
        [frontendToDb.fazenda]: registro.fazenda,
        [frontendToDb.zona]: registro.zona,
        [frontendToDb.estoqueInicial]: registro.estoqueInicial,
        [frontendToDb.estoqueDia]: registro.estoqueDia,
        [frontendToDb.estoqueTotal]: registro.estoqueTotal,
        [frontendToDb.criadoEm]: registro.criadoEm,
        [frontendToDb.status]: registro.status
      };

      const paramIssues = [];
      const params = columns.map(col => {
        const colUpper = String(col).toUpperCase();
        const meta = dbMetaByColumn.get(colUpper);
        const dbType = String(dbTypesByColumn.get(colUpper) || '').toUpperCase();
        const rawValue = valueByColumn[col];

        let converted;
        if (col === frontendToDb.estoqueInicial || col === frontendToDb.estoqueDia) {
          const parsedKg = parseKgInteger(rawValue);
          converted = dbType.includes('NUMBER')
            ? parsedKg
            : (hasValue(rawValue) ? String(rawValue).trim() : null);
        } else if (col === frontendToDb.estoqueTotal) {
          const parsedSaldo = parseSaldoTotal(rawValue);
          converted = dbType.includes('NUMBER')
            ? parsedSaldo
            : (hasValue(rawValue) ? String(rawValue).trim() : null);
        } else if (col === frontendToDb.id) {
          const parsedId = parseNumberForDb(rawValue);
          converted = dbType.includes('NUMBER') ? parsedId : (rawValue === null || rawValue === undefined ? null : String(rawValue));
        } else if (col === frontendToDb.criadoEm) {
          const parsedData = parsePtBrDateTimeToOracle(rawValue);
          converted = (dbType.includes('DATE') || dbType.includes('TIMESTAMP'))
            ? parsedData
            : (parsedData || (rawValue === null || rawValue === undefined ? null : String(rawValue)));
        } else if (col === frontendToDb.status) {
          converted = hasValue(rawValue) ? String(rawValue).trim() : null;
        } else {
          converted = convertByDbType(rawValue, dbType);
        }

        if ((dbType.includes('NUMBER') || dbType.includes('FLOAT') || dbType.includes('DECIMAL') || dbType.includes('INTEGER')) && hasValue(rawValue) && converted === null) {
          paramIssues.push({
            column: col,
            value: rawValue,
            issue: 'Valor numérico inválido para coluna numérica'
          });
        }

        if ((col === frontendToDb.criadoEm || dbType.includes('DATE') || dbType.includes('TIMESTAMP')) && hasValue(rawValue) && converted === null) {
          paramIssues.push({
            column: col,
            value: rawValue,
            issue: 'Data inválida. Use formato dd/mm/aaaa, hh:mm:ss'
          });
        }

        if (meta && meta.precision && typeof converted === 'number' && Number.isFinite(converted)) {
          const maxDigits = Number(meta.precision);
          const digits = String(Math.abs(converted)).replace('.', '').replace('-', '');
          if (digits.length > maxDigits) {
            paramIssues.push({
              column: col,
              value: rawValue,
              issue: `Excede precisão da coluna (${maxDigits})`
            });
          }
        }

        if (meta && meta.length && typeof converted === 'string') {
          const maxLength = Number(meta.length);
          if (Number.isFinite(maxLength) && converted.length > maxLength) {
            paramIssues.push({
              column: col,
              value: converted,
              issue: `Texto excede tamanho da coluna (${converted.length}/${maxLength})`
            });
          }
        }

        return converted;
      });

      if (paramIssues.length > 0) {
        await conn.close();
        return res.status(400).json({
          error: `Falha de validação no registro ${index + 1}`,
          table: `${schema}.${table}`,
          paramIssues,
          mappedColumns: columns
        });
      }

      try {
        await conn.query(sql, params);
      } catch (insertError) {
        const odbcDetails = Array.isArray(insertError?.odbcErrors)
          ? insertError.odbcErrors.map(e => `${e.state || ''} ${e.code || ''} ${e.message || ''}`.trim()).join(' | ')
          : null;
        const expandedError = {
          name: insertError?.name,
          message: insertError?.message,
          sqlstate: insertError?.sqlstate,
          code: insertError?.code,
          cause: insertError?.cause,
          stack: insertError?.stack
        };
        console.error('insert error detail', {
          message: insertError?.message,
          odbcErrors: insertError?.odbcErrors,
          expandedError,
          sql,
          params,
          table: `${schema}.${table}`
        });
        await conn.close();
        return res.status(500).json({
          error: `Falha ao inserir registro ${index + 1}`,
          detail: [insertError.message, odbcDetails].filter(Boolean).join(' | '),
          expandedError,
          sql,
          table: `${schema}.${table}`,
          mappedColumns: columns,
          params,
          dictionaryColumnsVisible: dbColumns.length > 0
        });
      }
    }

    await conn.close();
    return res.json({
      ok: true,
      inserted: registros.length,
      table: `${schema}.${table}`,
      dictionaryColumnsVisible: dbColumns.length > 0
    });
  } catch (err) {
    if (conn) {
      try { await conn.close(); } catch {}
    }
    return res.status(500).json({ error: err.message });
  }
});

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '0.0.0.0';

app.listen(port, host, () => {
  console.log(`test API server listening on http://${host}:${port}`);
});