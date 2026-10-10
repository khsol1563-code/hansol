# Cloudflare 배포

공개 사이트: https://hansol-97l.pages.dev

웹앱 추가하기 또는 수정 버튼을 누른 뒤 관리자 비밀번호를 입력하면 제목, 링크, 썸네일을 등록하거나 수정·삭제할 수 있습니다. 모든 이력과 웹앱은 Cloudflare 저장 서버에 보관되며 다른 방문자에게도 표시됩니다. 비밀번호는 기존에 지정한 값을 사용합니다.

- `index.html`: 공개 화면과 편집 기능
- `functions/api/editor.js`: 기존 Pages 주소와 저장 서버 연결
- `cloudflare/worker.mjs`: SQLite Durable Object 영구 저장
- `cloudflare/editor.mjs`: 비밀번호 인증, 로그인 세션, 저장 검증
- `wrangler.jsonc`: Pages 설정
- `cloudflare/wrangler.jsonc`: 저장 서버 설정

GitHub main 브랜치에 화면 변경을 올리면 기존 Cloudflare Pages 연결이 `npm run build`를 실행하고 `cloudflare/public`을 배포합니다. 저장 서버 코드까지 변경한 경우 다음 명령으로 둘 다 배포합니다.

```sh
npm ci
npx wrangler login
npm test
npm run deploy
```

로컬 Cloudflare 서버: `npm run dev`. HTML 파일을 직접 열었을 때는 편집 내용이 해당 브라우저에만 저장되므로 공유할 웹앱은 공개 사이트에서 등록하세요.

썸네일은 JPEG로 축소해 저장하며 웹앱은 최대 30개, 목록 용량은 최대 380,000자입니다. 저장 서버를 다시 배포해도 기존 내용은 유지됩니다. 여러 창에서 동시에 편집하면 이전 내용의 덮어쓰기를 막고 다시 열도록 안내합니다.
