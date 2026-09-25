const fs = require('fs');
const path = require('path');

const targetPath = 'D:\\Projects\\Ironmanthemeportfolio\\lib\\initialData.ts';
let content = fs.readFileSync(targetPath, 'utf8');

content = content.replace('title: "CurricuRAG",', 'title: "Relation-Aware Graph Retrieval over a Curriculum Knowledge Graph for Prerequisite QA",');
content = content.replace('title: "CurricuRAG: Curriculum Knowledge-Graph Enhanced RAG",', 'title: "Relation-Aware Graph Retrieval over a Curriculum Knowledge Graph for Prerequisite QA",');

fs.writeFileSync(targetPath, content, 'utf8');
console.log('Successfully updated lib/initialData.ts');
