workflow "Deploy to Github Pages" {
  on = "push"
  resolves = ["Deploy to gh-pages"]
}

action "master branch only" {
  uses = "actions/bin/filter@master"
  args = "branch main"
}

action "Deploy to gh-pages" {
  uses = "JamesIves/github-pages-deploy-action@master"
  env = {
    BRANCH = "gh-pages"
    BUILD_SCRIPT = "npm i -g pnpm && pnpm i --production --frozen-lockfile && pnpm run it"
    FOLDER = "www"
    BASE_BRANCH = "main"
    CNAME = "what.passcod.name"
  }
  needs = ["master branch only"]
  secrets = ["ACCESS_TOKEN"]
}
