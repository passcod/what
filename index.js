import TOML from '@iarna/toml';
import { promises as fs } from 'fs';
import globby from 'globby';
import { basename } from 'path';
import slugify from '@sindresorhus/slugify';
import contractions from 'expand-contractions';
import ms from 'ms';
import luxon from 'luxon';
import sortOn from 'sort-on';
import git from 'simple-git/promise.js';

function parsedate (date) {
  return luxon.DateTime.fromISO(date).setZone('Pacific/Auckland');
}

function parsegittime (time) {
  const [d, t, z] = time.split(' ');
  return parsedate(`${d}T${t}${z}`);
}

async function load (path) {
  const file = await fs.readFile(path);
  const data = TOML.parse(file);
  data.path = path;

  if (!data.status) data.status = path.split('/', 2)[0];
  if (!data.name) data.name = basename(path, '.toml');
  if (!data.slug) data.slug = slugify(contractions.expand(data.name.replace(/[^\w.]+/g, ' ')));

  if (!Array.isArray(data.with)) data.with = [data.with].filter(_=>_)
  if (!Array.isArray(data.where)) data.where = [data.where].filter(_=>_)
  if (!Array.isArray(data.media)) data.media = [data.media].filter(_=>_)

  if (data.started) data.started = parsedate(data.started).toString();
  if (data.finished) data.finished = parsedate(data.finished).toString();

  for (const i in data.where) {
    let where = data.where[i];
    if (where.startsWith('github:'))
      where = data.where[i] = where.replace('github:', 'https://github.com/');
  }

  try {
    const logs = await git('.').log({ file: path, n: 1 });
    if (logs && logs.latest) {
      data.commit = logs.latest.hash;
      data.modified = parsegittime(logs.latest.date).toString();
    }
  } catch (_) {
    //
  }

  return data;
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
  const modified = data.modified && (parsedate(data.modified).toFormat('d LLLL y, ~H:mm') + ' NZ');

  return `
    <article id="${data.slug}" class="${data.status}" data-commit="${data.commit}">
      <header>
        <h2><a href="#${data.slug}">${data.name}</a></h2>
        <p class="what">${widowfix(data.what)}</p>
        ${started ? `<time class="started" datetime="${data.started}"
          title="${data.started}">Started ${started}</time>` : ''}
        ${finished ? `<time class="finished" datetime="${data.finished}"
          title="${data.finished}">Finished ${finished}</time>` : ''}
      </header>

      ${data.how ? `<h3 class="how">How I’m doing that / Some details:</h3>
      ${data.how.split('\n').map(p => `<p>${widowfix(p)}</p>`).join('\n')}` : ''}

      ${data.now ? `<h3 class="now">Where I’m up to now:</h3>
      <p class="now">${widowfix(data.now)}</p>` : ''}

      <footer>
        <dl>
          ${modified ? `<dt>Last modified:</dt>
          <dd>
            <time datetime="${data.modified}" title="${data.modified}">${modified}</time>
            (<a href="https://github.com/passcod/what/commits/${data.commit}/${data.path}">history</a>)
          </dd>` : ''}

          ${data.with.length ? `<dt>With:</dt>
          <dd class="with">${data.with.map(w => `<span class="with">${w}</span>`).join(', ')}</dd>`
          : ''}

          ${data.where.length ? `<dt>Where:</dt>
          <dd><ul>
            ${data.where.map(w => `<li><a href="${w}">${w}</a></li>`).join('\n')}
          </ul></dd>`
          : ''}

          ${data.media.length ? `<dt>Media:</dt>
          <dd><ul>
            ${data.media.map(w => `<li><a href="${w}">${w}</a></li>`).join('\n')}
          </ul></dd>`
          : ''}
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

log('Starting...');
(async function main () {
  log('Started');

  let projects = await globby(['doing/*.toml', 'done/*.toml']);
  log(`Found ${projects.length} projects`);

  projects = await Promise.all(projects.map(load));
  log('Loaded');

  projects = sortOn(projects, [
    'status',
    '-finished',
    '-modified',
    '-started',
    'name',
  ]);
  log('Sorted');

  projects = await Promise.all(projects.map(render));
  log('Rendered');

  let template = await fs.readFile('template.html');
  template = template.toString().replace(/<template\s*\/>/, projects.join('\n'));
  await fs.writeFile('www/index.html', template);
  log('Written');
}()).catch((err) => {
  console.error(err);
  process.exit(err.code || 1);
});
