const fs = require('fs');
const prod = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const repo = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));

console.log('=== ESTRUCTURA ===');
console.log('Prod nodes:', prod.nodes.length);
console.log('Repo nodes:', repo.nodes.length);

console.log('\n=== NODOS PRODUCCION ===');
prod.nodes.forEach(n => console.log('  ' + n.name + ' | ' + n.type));

console.log('\n=== NODOS REPO ===');
repo.nodes.forEach(n => console.log('  ' + n.name + ' | ' + n.type));

const prodNames = new Set(prod.nodes.map(n => n.name));
const repoNames = new Set(repo.nodes.map(n => n.name));

const onlyProd = [...prodNames].filter(n => { return !repoNames.has(n); });
const onlyRepo = [...repoNames].filter(n => { return !prodNames.has(n); });

if (onlyProd.length) console.log('\nSOLO EN PRODUCCION:', onlyProd);
if (onlyRepo.length) console.log('\nSOLO EN REPO:', onlyRepo);

// Compare SQL queries and JS code for matching nodes
const common = [...prodNames].filter(n => { return repoNames.has(n); });
for (const name of common) {
  const pNode = prod.nodes.find(n => n.name === name);
  const rNode = repo.nodes.find(n => n.name === name);

  const pParams = JSON.stringify(pNode.parameters);
  const rParams = JSON.stringify(rNode.parameters);

  if (pParams !== rParams) {
    console.log('\nDIFF en "' + name + '" (' + pNode.type + '):');

    // Show SQL query diffs
    if (pNode.parameters.query && rNode.parameters.query) {
      const pq = pNode.parameters.query.replace(/\s+/g, ' ').trim();
      const rq = rNode.parameters.query.replace(/\s+/g, ' ').trim();
      if (pq !== rq) {
        console.log('  QUERY PROD:', pq.substring(0, 200));
        console.log('  QUERY REPO:', rq.substring(0, 200));
      } else {
        console.log('  (SQL identical after whitespace normalization)');
      }
    }

    // Show JS code diffs (first 100 chars)
    if (pNode.parameters.jsCode && rNode.parameters.jsCode) {
      if (pNode.parameters.jsCode !== rNode.parameters.jsCode) {
        // Find first difference
        const pLines = pNode.parameters.jsCode.split('\n');
        const rLines = rNode.parameters.jsCode.split('\n');
        console.log('  JS lines: prod=' + pLines.length + ' repo=' + rLines.length);
        for (let i = 0; i < Math.max(pLines.length, rLines.length); i++) {
          if (pLines[i] !== rLines[i]) {
            console.log('  First diff at line ' + (i+1) + ':');
            console.log('    PROD: ' + (pLines[i] || '(missing)').substring(0, 120));
            console.log('    REPO: ' + (rLines[i] || '(missing)').substring(0, 120));
            break;
          }
        }
      }
    }
  }
}

// Compare connections
const pConns = JSON.stringify(prod.connections);
const rConns = JSON.stringify(repo.connections);
if (pConns === rConns) {
  console.log('\n=== CONNECTIONS: IDENTICAS ===');
} else {
  console.log('\n=== CONNECTIONS: DIFERENTES ===');
  const pKeys = Object.keys(prod.connections).sort();
  const rKeys = Object.keys(repo.connections).sort();
  if (JSON.stringify(pKeys) !== JSON.stringify(rKeys)) {
    console.log('  Prod connection keys:', pKeys);
    console.log('  Repo connection keys:', rKeys);
  }
}
