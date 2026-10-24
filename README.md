# 고한솔 홈페이지

개인 홈페이지와 비밀번호 보호 관리자 편집 기능을 Cloudflare Pages 및 Workers에 배포하는 저장소입니다.

- 공개 사이트: https://hansol-97l.pages.dev
- Cloudflare Worker: `hansol-portfolio`
- Pages 프로젝트: `hansol`
- 관리자 기능: 홈페이지 문구·이력·웹앱·수업 자료·피드백 관리
- 자료 기능: 게시물당 웹 링크와 첨부파일 최대 5개

## 다른 PC에서 사용하기

Node.js와 Git을 설치한 뒤 다음 명령을 실행합니다.

```bash
git clone https://github.com/khsol1563-code/hansol.git
cd hansol
npm ci
npm test
npm run dev
```

로컬 개발 서버는 기본적으로 `http://127.0.0.1:8787`에서 실행됩니다.

## Cloudflare에 다시 배포하기

동일한 Cloudflare 계정으로 로그인한 다음 배포합니다.

```bash
npx wrangler login
npm run deploy
```

`npm run deploy`는 정적 파일을 빌드하고 Worker와 Pages를 차례대로 배포합니다.

## 저장 데이터 안내

GitHub에는 소스 코드와 테스트만 저장됩니다. 관리자 화면에서 등록한 게시물, 피드백, 첨부파일은 Cloudflare Durable Object에 저장되므로 `git clone`에는 포함되지 않습니다. 동일한 Cloudflare 계정과 기존 프로젝트에 배포하면 운영 중인 서버 데이터를 계속 사용합니다.

로컬 전용 비밀값이 필요한 경우 `.env` 또는 `.dev.vars`를 사용하세요. 두 파일은 Git에서 제외됩니다.
