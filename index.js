import TOML from '@iarna/toml';
import yargs from 'yargs';
import { promises as fs } from 'fs';
import globby from 'globby';
import { basename } from 'path';
import slugify from '@sindresorhus/slugify';
import contractions from 'expand-contractions';
import ms from 'ms';
import luxon from 'luxon';

async function load (path) {
  const file = await fs.readFile(path);
  const data = TOML.parse(file);
  if (!data.status) data.status = path.split('/', 2)[0];
  if (!data.name) data.name = basename(path, '.toml');
  if (!data.slug) data.slug = slugify(contractions.expand(data.name.replace(/[^\w.]+/g, ' ')));

  if (!Array.isArray(data.with)) data.with = [data.with]
  if (!Array.isArray(data.where)) data.where = [data.where]
  if (!Array.isArray(data.media)) data.media = [data.media]

  for (const i in data.where) {
    let where = data.where[i];
    if (where.startsWith('github:'))
      where = data.where[i] = where.replace('github:', 'https://github.com/');
  }

  return data;
}

function parsedate (date) {
  return luxon.DateTime.fromISO(date).setZone('Pacific/Auckland');
}

function widowfix (text) {
  const words = text.split(/\s+/);
  const ult = words.pop();
  const pen = words.pop();
  words.push([pen, ult].join('&nbsp;'));
  return words.join(' ');
}

async function render (data) {
  const started = data.started && parsedate(data.started).toFormat('d LLLL y');
  const finished = data.finished && parsedate(data.finished).toFormat('d LLLL y');

  return `
    <article id="${data.slug}" class="${data.status}">
      <header>
        <h2><a href="#${data.slug}">${data.name}</a></h2>
        <p class="what">${widowfix(data.what)}</p>
        ${started ? `<time class="started" datetime="${data.started}">Started ${started}</time>` : ''}
        ${finished ? `<time class="finished" datetime="${data.finished}">Finished ${finished}</time>` : ''}
      </header>
      <h3 class="how">How I’m doing that / Some details:</h3>
      ${data.how.split('\n').map(p => `<p>${widowfix(p)}</p>`).join('\n')}
      <h3 class="now">Where I’m up to now:</h3>
      ${data.now ? `<p class="now">${widowfix(data.now)}</p>` : ''}
      <footer>
        <dl>
          <dt>With:</dt>
          <dd class="with">${data.with.map(w => `<span class="with">${w}</span>`).join(', ')}</dd>

          <dt>Where:</dt>
          <dd><ul>
            ${data.where.map(w => `<li><a href="${w}">${w}</a></li>`).join('\n')}
          </ul></dd>

          <dt>Media:</dt>
          <dd><ul>
            ${data.media.map(w => `<li><a href="${w}">${w}</a></li>`).join('\n')}
          </ul></dd>
        </dl>
      </footer>
    </article>
  `;
}

const start = +new Date;
function log (...args) {
  const elapsed = (+new Date) - start;
  args.unshift(`[${ms(elapsed)}]`);
  console.log(...args);
}

function datems (date) {
  return +parsedate(date).toFormat('x');
}

log('Starting...');
(async function main (args) {
  log('Started');

  let projects = await globby(['doing/*.toml', 'done/*.toml']);
  log(`Found ${projects.length} projects`);

  projects = await Promise.all(projects.map(load));
  log('Loaded');

  projects.sort((a, b) => {
    if (a.name > b.name) return 1;
    if (b.name > a.name) return -1;
    return 0;
  });

  // 'doing' sorts higher than 'done'
  projects.sort((a, b) => {
    if (a.status > b.status) return 1;
    if (b.status > a.status) return -1;
    return 0;
  });

  projects.sort((a, b) => {
    if (a.finished && b.finished)
      return datems(b.finished) - datems(a.finished);

    if (a.started && b.started)
      return datems(b.started) - datems(a.started);

    return 0;
  });
  log('Sorted');

  projects = await Promise.all(projects.map(render));
  log('Rendered');

  let template = await fs.readFile('template.html');
  template = template.toString().replace(/<template\s*\/>/, projects.join('\n'));
  await fs.writeFile('www/index.html', template);
  log('Written');
}(yargs.argv)).catch((err) => {
  console.error(err);
  process.exit(err.code || 1);
});
