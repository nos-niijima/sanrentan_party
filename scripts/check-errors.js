#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

console.log('🔍 テストプレイ基盤 - エラーチェック開始\n');

// Backend TypeScript チェック
console.log('📋 Backend TypeScript チェック...');
try {
  execSync('pnpm --filter @playtest-board/backend exec tsc --noEmit', {
    stdio: 'pipe',
    cwd: process.cwd()
  });
  console.log('✅ Backend TypeScript: エラーなし');
} catch (error) {
  console.log('❌ Backend TypeScript エラー:');
  console.log(error.stdout.toString());
}

// Frontend TypeScript チェック
console.log('\n📋 Frontend TypeScript チェック...');
try {
  execSync('pnpm --filter @playtest-board/frontend exec tsc --noEmit', {
    stdio: 'pipe',
    cwd: process.cwd()
  });
  console.log('✅ Frontend TypeScript: エラーなし');
} catch (error) {
  console.log('❌ Frontend TypeScript エラー:');
  console.log(error.stdout.toString());
}

// Backend ビルドチェック
console.log('\n📋 Backend ビルドチェック...');
try {
  execSync('pnpm --filter @playtest-board/backend build', {
    stdio: 'pipe',
    cwd: process.cwd()
  });
  console.log('✅ Backend ビルド: 成功');
} catch (error) {
  console.log('❌ Backend ビルドエラー:');
  console.log(error.stdout.toString());
}

// Frontend ビルドチェック
console.log('\n📋 Frontend ビルドチェック...');
try {
  execSync('pnpm --filter @playtest-board/frontend build', {
    stdio: 'pipe',
    cwd: process.cwd()
  });
  console.log('✅ Frontend ビルド: 成功');
} catch (error) {
  console.log('❌ Frontend ビルドエラー:');
  console.log(error.stdout.toString());
}

// テスト実行
console.log('\n📋 テスト実行...');
try {
  execSync('pnpm --filter @playtest-board/backend test', {
    stdio: 'pipe',
    cwd: process.cwd()
  });
  console.log('✅ テスト: 全て成功');
} catch (error) {
  console.log('❌ テストエラー:');
  console.log(error.stdout.toString());
}

console.log('\n🎉 エラーチェック完了');