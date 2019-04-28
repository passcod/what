import TOML from '@iarna/toml';
import yargs from 'yargs';
import { promises as fs } from 'fs';
import globby from 'globby';
import { basename } from 'path';

async function process (path) {
  const file = await fs.readFile(path);
  const data = TOML.parse(file);
  if (!data.status) data.status = path.split('/', 2)[0];
  if (!data.name) data.name = basename(path, '.toml');
  return data;
}

(async function main (args) {
  const projects = await globby(['doing/*.toml', 'done/*.toml']);
  const statii = await Promise.all(projects.map(process));

  console.log(statii);
}(yargs.argv)).catch((err) => {
  console.error(err);
  process.exit(err.code || 1);
});
