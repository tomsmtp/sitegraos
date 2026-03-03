import odbc from 'odbc';
import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_TABLE = process.env.APONTAMENTO_TABLE || 'QUALIDADE.GESTAO_CARGAS_TRANSPORTE';
const tableSpec = (process.argv[2] || DEFAULT_TABLE).toUpperCase();

if (!/^[A-Z0-9_]+\.[A-Z0-9_]+$/.test(tableSpec)) {
  console.error('Use: node diagnostico_apontamento.js SCHEMA.TABELA');
  process.exit(1);
}

const [owner, table] = tableSpec.split('.');

const expectedMap = {
  id: ['ID_DISPONIBILIDADE'],
  unidade: ['UNIDADE'],
  fazenda: ['FAZENDA'],
  zona: ['ZONA'],
  estoqueInicial: ['ESTOQUE_INICIAL'],
  estoqueDia: ['COLHEITA_DIA'],
  estoqueTotal: ['SALDO_DISPONIVEL'],
  criadoEm: ['DATA_REGISTRO'],
  status: ['STATUS_DISP']
};

async function run() {
  const connStr = `DSN=${process.env.DB_DSN2};UID=${process.env.DB_USER2};PWD=${process.env.DB_PASS2}`;
  let conn;

  try {
    conn = await odbc.connect(connStr);
    console.log(`Conectado. Alvo: ${owner}.${table}`);

    const tables = await conn.query(
      `SELECT owner, table_name
       FROM all_tables
       WHERE owner = ?
         AND table_name = ?`,
      [owner, table]
    );

    const views = await conn.query(
      `SELECT owner, view_name
       FROM all_views
       WHERE owner = ?
         AND view_name = ?`,
      [owner, table]
    );

    if (tables.length === 0 && views.length === 0) {
      console.log('Tabela/View não encontrada nesse owner.');
      const sample = await conn.query(
        `SELECT owner, table_name
         FROM all_tables
         WHERE owner = ?
           AND table_name LIKE ?
           AND ROWNUM <= 20`,
        [owner, `%${table.slice(0, 12)}%`]
      );
      console.log('Sugestões:', sample.map(r => `${r.OWNER || r.owner}.${r.TABLE_NAME || r.table_name}`));
      return;
    }

    console.log(`Objeto encontrado como: ${tables.length > 0 ? 'TABLE' : 'VIEW'}`);

    const cols = await conn.query(
      `SELECT column_id, column_name, data_type, data_length, data_precision, data_scale, nullable, data_default
       FROM all_tab_columns
       WHERE owner = ?
         AND table_name = ?
       ORDER BY column_id`,
      [owner, table]
    );

    console.log(`Total de colunas: ${cols.length}`);

    const colMap = new Map();
    for (const c of cols) {
      const name = (c.COLUMN_NAME || c.column_name || '').toUpperCase();
      colMap.set(name, c);
    }

    const requiredNoDefault = cols
      .filter(c => (c.NULLABLE || c.nullable) === 'N' && !(c.DATA_DEFAULT || c.data_default))
      .map(c => c.COLUMN_NAME || c.column_name);

    console.log('\nColunas obrigatórias sem default:');
    console.log(requiredNoDefault.length ? requiredNoDefault.join(', ') : '(nenhuma)');

    console.log('\nChecagem de mapeamento APONTAMENTO:');
    const mappingReport = Object.entries(expectedMap).map(([field, candidates]) => {
      const found = candidates.find(col => colMap.has(col));
      return {
        field,
        dbColumn: found || null,
        ok: Boolean(found)
      };
    });

    for (const item of mappingReport) {
      console.log(`- ${item.field}: ${item.ok ? `OK -> ${item.dbColumn}` : 'FALTANDO'}`);
    }

    const missing = mappingReport.filter(x => !x.ok).map(x => x.field);

    const firstCols = cols.slice(0, 40).map(c => ({
      name: c.COLUMN_NAME || c.column_name,
      type: c.DATA_TYPE || c.data_type,
      nullable: c.NULLABLE || c.nullable,
      length: c.DATA_LENGTH || c.data_length,
      precision: c.DATA_PRECISION || c.data_precision,
      scale: c.DATA_SCALE || c.data_scale
    }));

    console.log('\nAmostra de metadados de colunas:');
    console.table(firstCols);

    if (missing.length > 0) {
      console.log(`\nAjustes pendentes no backend para campos: ${missing.join(', ')}`);
    } else {
      console.log('\nMapeamento base do APONTAMENTO está compatível com a tabela.');
    }

    const canProbe = tables.length > 0;
    if (canProbe) {
      try {
        await conn.query(`SELECT * FROM ${owner}.${table} FETCH FIRST 1 ROWS ONLY`);
        console.log('Leitura de dados: OK');
      } catch (readErr) {
        console.log(`Leitura de dados: FALHA -> ${readErr.message}`);
      }
    }
  } catch (err) {
    console.error('Erro no diagnóstico:', err.message);
  } finally {
    if (conn) {
      try { await conn.close(); } catch {}
    }
  }
}

run();
