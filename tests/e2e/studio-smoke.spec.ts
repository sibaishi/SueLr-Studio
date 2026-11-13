import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { unzipSync } from 'fflate';

async function clearLocalState(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.request.post('/api/settings/reset');
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('suelr_onboarding_dismissed', 'true');
  });
  await page.reload();

  await expect(page.getByTestId('workflow-page')).toBeVisible({ timeout: 10_000 });
}

async function addTextInputNode(page: import('@playwright/test').Page) {
  await page.getByTestId('workflow-add-node').click();
  await page.getByTestId('workflow-node-catalog-item-io').click();
}

async function addWorkflowNode(page: import('@playwright/test').Page, nodeType: 'aiV3' | 'io') {
  await page.getByTestId('workflow-add-node').click();
  await page.getByTestId(`workflow-node-catalog-item-${nodeType}`).click();
}

async function openSettings(page: import('@playwright/test').Page) {
  await page.getByTestId('workflow-open-settings').click();
  await expect(page.getByTestId('settings-page')).toBeVisible();
}

async function openConnectionSettings(page: import('@playwright/test').Page) {
  await openSettings(page);
  await page.getByTestId('settings-module-connection').click();
  await expect(page.getByTestId('settings-base-url-field')).toBeVisible();
}

async function readPersistedStudioConfig(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/settings/studio');
    const payload = await response.json();
    const runtime = payload?.data?.runtime;
    const activeConfigId = runtime?.activeConfigId;
    const configs = Array.isArray(runtime?.configs) ? runtime.configs : [];
    const activeConfig = configs.find((config: { id?: string }) => config.id === activeConfigId) ?? configs[0] ?? null;

    return {
      activeConfigId,
      activeConfig,
    };
  });
}

async function readStableNodeCount(page: import('@playwright/test').Page) {
  await expect
    .poll(
      async () => {
        const first = await page.locator('.react-flow__node').count();
        await page.waitForTimeout(250);
        const second = await page.locator('.react-flow__node').count();
        return first === second ? second : Number.NaN;
      },
      {
        timeout: 5_000,
        intervals: [250, 500],
      },
    )
    .not.toBeNaN();
  return page.locator('.react-flow__node').count();
}

async function readWorkflowByName(page: import('@playwright/test').Page, name: string) {
  return page.evaluate(async (workflowName) => {
    const response = await fetch('/api/workflows');
    const payload = await response.json();
    const workflows = Array.isArray(payload?.data) ? payload.data : [];
    return workflows.find((workflow: { name?: string }) => workflow.name === workflowName) ?? null;
  }, name);
}

async function readWorkflowDocument(page: import('@playwright/test').Page, workflowId: string) {
  return page.evaluate(async (id) => {
    const response = await fetch(`/api/workflows/${encodeURIComponent(id)}`);
    const payload = await response.json();
    return payload?.data ?? null;
  }, workflowId);
}

async function readDuplicateWorkflow(
  page: import('@playwright/test').Page,
  originalId: string,
  workflowName: string,
) {
  return page.evaluate(
    async ({ sourceId, sourceName }) => {
      const response = await fetch('/api/workflows');
      const payload = await response.json();
      const workflows = Array.isArray(payload?.data) ? payload.data : [];
      return (
        workflows.find(
          (workflow: { id?: string; name?: string }) =>
            workflow.id !== sourceId && typeof workflow.name === 'string' && workflow.name.startsWith(sourceName),
        ) ?? null
      );
    },
    { sourceId: originalId, sourceName: workflowName },
  );
}

async function readWorkflowExistence(
  page: import('@playwright/test').Page,
  originalId: string,
  duplicatedId: string,
) {
  return page.evaluate(
    async ({ sourceId, copyId }) => {
      const response = await fetch('/api/workflows');
      const payload = await response.json();
      const workflows = Array.isArray(payload?.data) ? payload.data : [];
      return {
        originalExists: workflows.some((workflow: { id?: string }) => workflow.id === sourceId),
        duplicateExists: workflows.some((workflow: { id?: string }) => workflow.id === copyId),
      };
    },
    { sourceId: originalId, copyId: duplicatedId },
  );
}

test.describe('studio smoke', () => {
  test('public developer docs reflect the current main plus release branch model', async ({ page }) => {
    await page.goto('/docs/developer-guide.md');
    await expect(page.locator('body')).toContainText('## Variant Delivery Model');
    await expect(page.locator('body')).toContainText('main');
    await expect(page.locator('body')).toContainText('release/local-web');
    await expect(page.locator('body')).toContainText('release/desktop');
  });

  test('an empty IO node resizes a sketch and saves it as an uploaded image', async ({ page }) => {
    const workflowName = `E2E Sketch ${Date.now().toString(36)}`;
    await clearLocalState(page);
    await page.getByTestId('workflow-new').click();
    await page.locator('.workflow-toolbar__title--editable').click();
    await page.locator('.workflow-toolbar__title-input').fill(workflowName);
    await page.keyboard.press('Enter');
    await addWorkflowNode(page, 'io');

    await page.getByRole('button', { name: '绘制草图' }).click();
    const editor = page.locator('.node-canvas-editor-modal');
    const save = editor.getByRole('button', { name: '保存到 IO 节点' });
    await expect(save).toBeDisabled();
    const canvas = editor.locator('canvas');
    await canvas.click();
    await expect(save).toBeEnabled();

    const width = editor.getByRole('spinbutton', { name: '宽度 (px)' });
    const height = editor.getByRole('spinbutton', { name: '高度 (px)' });
    const apply = editor.getByRole('button', { name: '应用尺寸' });
    await editor.getByRole('combobox', { name: '画布比例' }).selectOption('16:9');
    await expect(width).toHaveValue('768');
    await expect(height).toHaveValue('432');
    await apply.click();
    await expect(canvas).toHaveAttribute('height', '432');
    await editor.getByRole('button', { name: '撤销' }).click();
    await expect(canvas).toHaveAttribute('height', '768');
    await editor.getByRole('button', { name: '重做' }).click();
    await expect(canvas).toHaveAttribute('height', '432');
    await width.fill('2049');
    await expect(apply).toBeDisabled();
    await width.fill('900');
    await height.fill('500');
    await apply.click();
    await expect(canvas).toHaveAttribute('width', '900');
    await expect(canvas).toHaveAttribute('height', '500');
    await editor.getByRole('button', { name: '适合视图' }).click();

    const box = (await canvas.boundingBox())!;
    await editor.getByRole('slider', { name: '防抖' }).focus();
    await page.keyboard.press('Home');
    const pen = await page.context().newCDPSession(page);
    const y = box.y + box.height / 4;
    await pen.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: box.x + box.width * 0.2, y, button: 'left', buttons: 1, clickCount: 1,
      pointerType: 'pen', force: 0.2,
    });
    for (const [offset, force] of [[0.3, 0.2], [0.4, 0.2], [0.6, 0.85], [0.7, 0.85], [0.8, 0.85]]) {
      await pen.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved', x: box.x + box.width * offset, y, buttons: 1, pointerType: 'pen', force,
      });
    }
    await pen.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: box.x + box.width * 0.8, y, button: 'left', buttons: 0,
      pointerType: 'pen', force: 0,
    });
    await pen.detach();

    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.8);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.64);
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8);
    await page.mouse.up();

    await save.click();
    await expect(editor).toHaveCount(0);
    const image = page.locator('.react-flow__node-io .node-gallery-frame-v2 img');
    await expect(image).toHaveAttribute('src', /^\/api\/files\//);
    const imageUrl = await image.getAttribute('src');
    await page.getByTestId('workflow-save').click();
    await expect.poll(async () => Boolean(await readWorkflowByName(page, workflowName))).toBe(true);

    await page.reload();
    await expect(image).toHaveAttribute('src', imageUrl as string);
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => ({
      width: element.naturalWidth,
      height: element.naturalHeight,
    }))).toEqual({ width: 900, height: 500 });
    const pixels = await image.evaluate((element: HTMLImageElement) => {
      const canvas = document.createElement('canvas');
      canvas.width = element.naturalWidth;
      canvas.height = element.naturalHeight;
      const context = canvas.getContext('2d')!;
      context.drawImage(element, 0, 0);
      return {
        background: Array.from(context.getImageData(0, 0, 1, 1).data),
        lightPressure: Array.from(context.getImageData(270, 133, 1, 1).data),
        heavyPressure: Array.from(context.getImageData(630, 133, 1, 1).data),
        roundedCurve: Array.from(context.getImageData(450, 340, 1, 1).data),
        sharpCorner: Array.from(context.getImageData(450, 320, 1, 1).data),
        stroke: Array.from(context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data),
      };
    });
    expect(pixels.background).toEqual([255, 255, 255, 255]);
    expect(pixels.stroke).toEqual([34, 34, 34, 255]);
    expect(pixels.lightPressure).toEqual([255, 255, 255, 255]);
    expect(pixels.heavyPressure).toEqual([34, 34, 34, 255]);
    expect(pixels.roundedCurve).toEqual([34, 34, 34, 255]);
    expect(pixels.sharpCorner).toEqual([255, 255, 255, 255]);
  });

  test('drawing aids preview shapes, apply through a feathered selection, and undo', async ({ page }) => {
    await clearLocalState(page);
    await page.getByTestId('workflow-new').click();
    await addWorkflowNode(page, 'io');
    await page.getByRole('button', { name: '绘制草图' }).click();
    const editor = page.locator('.node-canvas-editor-modal');
    const canvas = editor.getByLabel('图像画布');
    await expect(editor.getByRole('slider', { name: '防抖' })).toHaveValue('25');
    const draw = async (points: number[][]) => {
      const box = (await canvas.boundingBox())!;
      const move = ([x, y]: number[]) => page.mouse.move(box.x + box.width * x, box.y + box.height * y);
      await move(points[0]);
      await page.mouse.down();
      for (const point of points.slice(1)) await move(point);
      await page.mouse.up();
    };
    const center = () => canvas.evaluate((el: HTMLCanvasElement) =>
      el.getContext('2d')!.getImageData(el.width / 2, el.height / 2, 1, 1).data[0]);
    await editor.getByRole('button', { name: '形状', exact: true }).click();
    const shape = editor.getByRole('combobox', { name: '形状', exact: true });
    for (const kind of ['line', 'arrow', 'rectangle', 'rounded', 'ellipse', 'polygon']) {
      await shape.selectOption(kind);
      await draw([[0.25, 0.3], [0.7, 0.7]]);
      await expect(editor.locator('.canvas-transform-frame .canvas-shape-preview path')).toBeVisible();
      await expect.poll(center).toBe(255);
      await page.keyboard.press('Escape');
      await expect(editor.locator('.canvas-transform-frame')).toHaveCount(0);
    }
    await editor.getByRole('button', { name: '手绘识形', exact: true }).click();
    await draw([[0.25, 0.5], [0.4, 0.502], [0.55, 0.498], [0.75, 0.5]]);
    await expect(shape).toHaveValue('line');
    await page.keyboard.press('Enter');
    await expect.poll(center).toBeLessThan(80);
    await editor.getByRole('button', { name: '撤销', exact: true }).click();
    await expect.poll(center).toBe(255);
    await draw([[0.25, 0.3], [0.4, 0.65], [0.55, 0.31], [0.7, 0.72]]);
    await expect(editor.getByRole('button', { name: '保留手绘' })).toBeVisible();
    await page.keyboard.press('Escape');

    await editor.getByRole('button', { name: '矩形选区', exact: true }).click();
    const feather = editor.getByRole('spinbutton', { name: '羽化 (px)' });
    await feather.fill('32');
    await feather.press('Enter');
    await draw([[0.2, 0.3], [0.5, 0.7]]);
    await editor.getByRole('button', { name: '形状', exact: true }).click();
    await shape.selectOption('rectangle');
    await draw([[0.3, 0.35], [0.75, 0.65]]);
    await editor.getByRole('checkbox', { name: '填充', exact: true }).check();
    await editor.getByLabel('填充颜色').fill('#222222');
    const width = editor.getByRole('spinbutton', { name: '宽', exact: true });
    await width.fill('320');
    await width.press('Enter');
    await expect(width).toHaveValue('320');
    await editor.getByRole('button', { name: '应用形状' }).click();
    const samples = await canvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext('2d')!;
      return [0.4, 0.5, 0.6].map((x) => ctx.getImageData(el.width * x, el.height / 2, 1, 1).data[0]);
    });
    expect(samples[0]).toBeLessThan(80);
    expect(samples[1]).toBeGreaterThan(80);
    expect(samples[1]).toBeLessThan(220);
    expect(samples[2]).toBe(255);
  });

  test('an IO image board resizes with transparency and clips drawing to a selection', async ({ page }) => {
    test.setTimeout(45_000);
    await clearLocalState(page);
    await page.getByTestId('workflow-new').click();
    await addWorkflowNode(page, 'io');
    const editor = page.locator('.node-canvas-editor-modal');
    await page.getByRole('button', { name: '绘制草图' }).click();
    await editor.locator('canvas').click();
    await editor.getByRole('button', { name: '保存到 IO 节点' }).click();
    const image = page.locator('.react-flow__node-io .node-gallery-frame-v2 img');
    await expect(image).toHaveAttribute('src', /^\/api\/files\//);
    await image.dblclick();
    await page.getByRole('button', { name: '画板', exact: true }).click();

    const canvas = editor.locator('canvas');
    await editor.getByRole('spinbutton', { name: '高度 (px)' }).fill('1024');
    await editor.getByRole('group', { name: '原图锚点' }).getByRole('button', { name: '下', exact: true }).click();
    await editor.getByRole('button', { name: '应用尺寸' }).click();
    await expect(canvas).toHaveAttribute('height', '1024');

    await editor.getByRole('slider', { name: '防抖' }).focus();
    await page.keyboard.press('Home');
    const pixel = (x: number, y: number) =>
      canvas.evaluate((element: HTMLCanvasElement, point) =>
        Array.from(element.getContext('2d')!.getImageData(point.x, point.y, 1, 1).data), { x, y });
    expect(await pixel(16, 16)).toEqual([0, 0, 0, 0]);
    expect(await pixel(16, 270)).toEqual([255, 255, 255, 255]);

    await editor.getByRole('button', { name: '矩形选区' }).click();
    const box = (await canvas.boundingBox())!;
    const drag = async (startX: number, startY: number, endX: number, endY: number) => {
      const box = (await canvas.boundingBox())!;
      await page.mouse.move(box.x + startX * box.width, box.y + startY * box.height);
      await page.mouse.down();
      await page.mouse.move(box.x + endX * box.width, box.y + endY * box.height, { steps: 8 });
      await page.mouse.up();
    };
    await drag(0.25, 0.05, 0.75, 0.2);
    await editor.getByRole('button', { name: '画笔', exact: true }).click();
    await drag(0.15, 0.1, 0.85, 0.1);
    expect(await pixel(384, 102)).toEqual([255, 55, 95, 255]);
    expect(await pixel(150, 102)).toEqual([0, 0, 0, 0]);
    await editor.getByTitle('隐藏：绘制层').click();
    expect(await pixel(384, 102)).toEqual([0, 0, 0, 0]);
    await editor.getByRole('button', { name: '撤销', exact: true }).click();
    expect(await pixel(384, 102)).toEqual([255, 55, 95, 255]);
    await editor.getByRole('combobox', { name: '混合模式' }).selectOption('multiply');
    const opacity = editor.getByRole('spinbutton', { name: '不透明度' });
    await opacity.fill('50');
    await opacity.press('Enter');
    expect((await pixel(384, 102))[3]).toBe(128);

    await editor.getByRole('button', { name: '椭圆选区', exact: true }).click();
    await drag(0.4, 0.06, 0.6, 0.14);
    await expect(editor.locator('.canvas-document__selection ellipse').first()).toBeVisible();
    await editor.getByRole('button', { name: '清除像素', exact: true }).click();
    expect(await pixel(384, 102)).toEqual([0, 0, 0, 0]);
    expect((await pixel(200, 102))[3]).toBe(128);
    await editor.getByRole('button', { name: '撤销', exact: true }).click();
    expect((await pixel(384, 102))[3]).toBe(128);

    await editor.getByText('绘制层', { exact: true }).dblclick();
    const layerName = editor.getByRole('textbox', { name: '图层名称' });
    await layerName.fill('标注');
    await layerName.press('Enter');
    await expect(editor.getByRole('button', { name: '选择图层：标注' })).toHaveAttribute('aria-pressed', 'true');

    const startTransform = editor.getByRole('button', { name: '自由变换', exact: true });
    await startTransform.click();
    await expect(editor.locator('.canvas-transform-frame [data-handle]')).toHaveCount(9);
    const frame = editor.locator('.canvas-transform-frame');
    const frameBox = (await frame.boundingBox())!;
    const x = frameBox.x + frameBox.width / 4;
    const y = frameBox.y + frameBox.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + box.height * 0.08, { steps: 6 });
    await page.mouse.up();
    expect(await pixel(384, 102)).toEqual([0, 0, 0, 0]);
    expect((await pixel(384, 184))[3]).toBe(128);
    await page.keyboard.press('Escape');
    expect((await pixel(384, 102))[3]).toBe(128);
    expect(await pixel(384, 184)).toEqual([0, 0, 0, 0]);

    await startTransform.click();
    const angle = editor.getByRole('spinbutton', { name: '角度' });
    await angle.fill('90');
    await angle.press('Enter');
    await editor.getByRole('button', { name: '应用变换' }).click();
    expect(await pixel(200, 102)).toEqual([0, 0, 0, 0]);
    expect((await pixel(384, 184))[3]).toBe(128);
    await editor.getByRole('button', { name: '撤销', exact: true }).click();
    expect((await pixel(200, 102))[3]).toBe(128);

    await editor.getByRole('button', { name: '套索选区', exact: true }).click();
    const lassoBox = (await canvas.boundingBox())!;
    const moveLasso = (x: number, y: number) => page.mouse.move(lassoBox.x + x * lassoBox.width, lassoBox.y + y * lassoBox.height);
    await moveLasso(0.35, 0.07);
    await page.mouse.down();
    await moveLasso(0.65, 0.07);
    await moveLasso(0.5, 0.18);
    await page.mouse.up();
    await expect(editor.locator('.canvas-document__selection polygon').first()).toBeVisible();
    await editor.getByRole('button', { name: '清除像素', exact: true }).click();
    expect(await pixel(384, 102)).toEqual([0, 0, 0, 0]);
    expect((await pixel(275, 102))[3]).toBe(128);
    await editor.getByRole('button', { name: '撤销', exact: true }).click();

    await editor.getByRole('button', { name: '图层菜单' }).click();
    await editor.getByRole('button', { name: '导出图层到当前 IO 节点', exact: true }).click();
    await expect(editor.getByRole('status').filter({ hasText: '图层已添加到当前 IO 节点' })).toBeVisible();
    const images = page.locator('.react-flow__node-io .node-gallery-frame-v2 img');
    await expect(page.locator('.react-flow__node-io')).toHaveCount(1);
    await expect(images).toHaveCount(2);
    const exportedPixels = await images.nth(1).evaluate(async (element: HTMLImageElement) => {
      await element.decode();
      const bitmap = document.createElement('canvas');
      bitmap.width = element.naturalWidth;
      bitmap.height = element.naturalHeight;
      const context = bitmap.getContext('2d')!;
      context.drawImage(element, 0, 0);
      return [bitmap.height, context.getImageData(384, 102, 1, 1).data[3], context.getImageData(16, 270, 1, 1).data[3]];
    });
    expect(exportedPixels).toEqual([1024, 128, 0]);

    await editor.getByRole('button', { name: '图层大小', exact: true }).click();
    const layerWidth = editor.getByRole('spinbutton', { name: '图层宽度 (px)' });
    await expect(layerWidth).toHaveValue('384');
    const layerHeight = editor.getByRole('spinbutton', { name: '图层高度 (px)' });
    const originalHeight = Number(await layerHeight.inputValue());
    await layerWidth.fill('192');
    await expect(layerHeight).toHaveValue(String(Math.round(originalHeight / 2)));
    await editor.getByRole('button', { name: '应用图层大小' }).click();
    await expect(canvas).toHaveAttribute('height', '1024');
    expect((await pixel(240, 96))[3]).toBeGreaterThan(100);
    expect((await pixel(500, 102))[3]).toBe(0);
    expect(await pixel(16, 270)).toEqual([255, 255, 255, 255]);
    await editor.getByRole('button', { name: '撤销', exact: true }).click();

    await editor.getByRole('button', { name: '图像大小', exact: true }).click();
    await editor.getByRole('spinbutton', { name: '图像宽度 (px)' }).fill('384');
    await expect(editor.getByRole('spinbutton', { name: '图像高度 (px)' })).toHaveValue('512');
    await editor.getByRole('button', { name: '应用图像大小' }).click();
    await expect(canvas).toHaveAttribute('width', '384');
    await expect(canvas).toHaveAttribute('height', '512');
    expect((await pixel(192, 51))[3]).toBe(128);
    expect(await pixel(8, 135)).toEqual([255, 255, 255, 255]);
    await editor.getByRole('button', { name: '撤销', exact: true }).click();

    await editor.getByRole('button', { name: '矩形选区', exact: true }).click();
    const outsideBox = (await canvas.boundingBox())!;
    await page.mouse.move(outsideBox.x - 12, outsideBox.y + outsideBox.height * 0.03);
    await page.mouse.down();
    await page.mouse.move(outsideBox.x + outsideBox.width * 0.2, outsideBox.y + outsideBox.height * 0.15);
    await page.mouse.up();
    const outline = editor.locator('.canvas-document__selection');
    await expect(outline).toBeVisible();
    expect(await outline.evaluate((element) => Number.parseInt((element as SVGElement).style.left, 10))).toBeLessThan(0);

    await editor.getByRole('button', { name: '画笔', exact: true }).click();
    await page.mouse.move(outsideBox.x - 12, outsideBox.y + outsideBox.height * 0.1);
    await page.mouse.down();
    await page.mouse.move(outsideBox.x + outsideBox.width * 0.1, outsideBox.y + outsideBox.height * 0.1, { steps: 8 });
    await page.mouse.up();
    expect((await pixel(8, 102))[3]).toBe(128);
    await editor.getByRole('button', { name: '撤销', exact: true }).click();
    expect((await pixel(8, 102))[3]).toBe(0);

    await editor.getByRole('button', { name: '平移', exact: true }).click();
    const beforePan = (await canvas.boundingBox())!;
    await page.mouse.move(beforePan.x - 12, beforePan.y + beforePan.height / 2);
    await page.mouse.down();
    await page.mouse.move(beforePan.x + 12, beforePan.y + beforePan.height / 2);
    await page.mouse.up();
    expect((await canvas.boundingBox())!.x - beforePan.x).toBeCloseTo(24);

    await editor.getByRole('button', { name: '平移', exact: true }).click();
    await editor.getByRole('button', { name: '适合视图' }).click();
    await editor.getByRole('button', { name: '矩形选区', exact: true }).click();
    await drag(0.25, 0.04, 0.75, 0.2);
    await editor.getByRole('button', { name: '纯色填充', exact: true }).click();
    await editor.getByRole('button', { name: '填充选区', exact: true }).click();
    expect((await pixel(384, 61))[3]).toBe(128);
    expect((await pixel(100, 61))[3]).toBe(0);
    await editor.getByRole('button', { name: '撤销', exact: true }).click();

    await editor.getByRole('button', { name: '渐变填充', exact: true }).click();
    await drag(0.2, 0.06, 0.8, 0.06);
    const gradientStart = await pixel(100, 61);
    const gradientEnd = await pixel(670, 61);
    expect(gradientStart[3]).toBe(128);
    expect(gradientEnd[3]).toBe(128);
    expect(gradientEnd[1]).toBeGreaterThan(gradientStart[1] + 150);
    await editor.getByRole('button', { name: '撤销', exact: true }).click();
    expect((await pixel(100, 61))[3]).toBe(0);

    await editor.getByRole('button', { name: '图层菜单' }).click();
    await editor.getByRole('button', { name: '导出图层到当前 IO 节点（裁紧）', exact: true }).click();
    await expect(images).toHaveCount(3);
    const trimmedSize = await images.nth(2).evaluate(async (element: HTMLImageElement) => {
      await element.decode();
      return [element.naturalWidth, element.naturalHeight];
    });
    expect(trimmedSize[0]).toBe(384);
    expect(trimmedSize[1]).toBeLessThan(40);

    await editor.getByRole('button', { name: '矩形选区', exact: true }).click();
    const mode = editor.getByRole('combobox', { name: '选区模式' });
    await drag(0.1, 0.035, 0.5, 0.2);
    await mode.selectOption('add');
    await drag(0.6, 0.035, 0.9, 0.2);
    await mode.selectOption('subtract');
    await drag(0.25, 0.035, 0.4, 0.2);
    await mode.selectOption('intersect');
    await drag(0.05, 0.035, 0.8, 0.2);
    await editor.getByRole('button', { name: '纯色填充', exact: true }).click();
    await editor.getByRole('button', { name: '填充选区', exact: true }).click();
    for (const x of [120, 340, 520]) expect((await pixel(x, 65))[3]).toBe(128);
    for (const x of [50, 235, 420, 650]) expect((await pixel(x, 65))[3]).toBe(0);
    await editor.getByRole('button', { name: '撤销', exact: true }).click();

    await editor.getByRole('button', { name: '矩形选区', exact: true }).click();
    await mode.selectOption('replace');
    const feather = editor.getByRole('spinbutton', { name: '羽化 (px)' });
    await feather.fill('32');
    await feather.press('Enter');
    await drag(0.25, 0.03, 0.75, 0.12);
    await editor.getByRole('button', { name: '纯色填充', exact: true }).click();
    await editor.getByRole('button', { name: '填充选区', exact: true }).click();
    const featheredAlpha = (await pixel(192, 65))[3];
    expect(featheredAlpha).toBeGreaterThan(10);
    expect(featheredAlpha).toBeLessThan(115);
    expect((await pixel(384, 65))[3]).toBeGreaterThan(115);
    await editor.getByRole('button', { name: '撤销', exact: true }).click();

    const sourceUrl = await image.first().getAttribute('src');
    await editor.getByRole('button', { name: '保存图片', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect.poll(() => image.first().getAttribute('src')).not.toBe(sourceUrl);
    await expect.poll(() => image.first().evaluate((element: HTMLImageElement) => element.naturalHeight)).toBe(1024);
  });

  test('workflow modals isolate input from the workspace and underlying dialogs', async ({ page }) => {
    await clearLocalState(page);
    await page.getByTestId('workflow-new').click();
    await addWorkflowNode(page, 'io');
    const editor = page.locator('.node-canvas-editor-modal');
    await page.getByRole('button', { name: '绘制草图' }).click();
    await editor.locator('canvas').click();
    await editor.getByRole('button', { name: '保存到 IO 节点' }).click();
    const node = page.locator('.react-flow__node-io');
    const image = node.locator('.node-gallery-frame-v2 img');
    await expect(image).toHaveAttribute('src', /^\/api\/files\//);
    await node.click({ position: { x: 30, y: 15 } });
    await expect(node).toHaveClass(/selected/);
    await image.dblclick();
    const preview = page.getByRole('dialog', { name: '查看大图' });
    await expect(preview).toBeFocused();
    const halo = page.locator('.workflow-grid-glow-halo');
    const haloPosition = () => halo.evaluateAll((elements) => elements.map((element) => {
      const { left, top } = (element as HTMLElement).style;
      return { left, top };
    }));
    const expectBackgroundPointerStill = async () => {
      const before = await haloPosition();
      await page.mouse.move(340, 300);
      await page.mouse.move(550, 380, { steps: 4 });
      const after = await haloPosition();
      // The previous glow may finish fading while the modal is open.
      expect(after.length === 0 || JSON.stringify(after) === JSON.stringify(before)).toBe(true);
    };
    await expectBackgroundPointerStill();
    const previewBackdrop = page.locator('.workflow-image-preview-modal > .settings-modal__backdrop');
    await expect(previewBackdrop).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.42)');
    await expect(previewBackdrop).toHaveCSS('backdrop-filter', 'blur(14px)');
    await expect(page.locator('#root')).toHaveAttribute('inert', '');
    await page.mouse.wheel(0, 250);
    await page.keyboard.press('Delete');
    await expect(node).toHaveCount(1);

    await preview.getByRole('button', { name: '画板', exact: true }).click();
    await expect(page.locator('.workflow-image-preview-modal')).toHaveAttribute('inert', '');
    await expectBackgroundPointerStill();
    await expect(editor.locator('.settings-modal__backdrop')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.42)');
    await page.keyboard.press('Delete');
    await expect(node).toHaveCount(1);
    await editor.locator('canvas').click();
    await page.keyboard.press('Escape');
    const confirm = page.getByRole('dialog', { name: '关闭画板？' });
    await expect(confirm).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirm).toHaveCount(0);
    await expect(editor.locator('canvas')).toBeFocused();
    await page.keyboard.press('Escape');
    await confirm.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(preview).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(preview).toHaveCount(0);
    await expect(page.locator('#root')).not.toHaveAttribute('inert', '');

    const pasteTextFile = () => page.evaluate(() => {
      const clipboardData = new DataTransfer();
      clipboardData.items.add(new File(['弹窗键盘测试'], 'keyboard.txt', { type: 'text/plain' }));
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData }));
    });
    await image.hover();
    await pasteTextFile();
    const textSnippet = page.locator('.react-flow__node-io .node-gallery-frame-v2').getByText(/弹窗键盘测试/);
    await textSnippet.dblclick();
    const nodeCount = await node.count();
    const text = page.getByRole('dialog', { name: '查看文本' });
    await expect(text).toBeFocused();
    await expectBackgroundPointerStill();
    await page.keyboard.press('Tab');
    await expect(text.getByRole('button').first()).toBeFocused();
    await pasteTextFile();
    await page.keyboard.press('Delete');
    await expect(node).toHaveCount(nodeCount);
    await expect(textSnippet).toHaveText('[keyboard.txt] 弹窗键盘测试');
    await previewBackdrop.click({ position: { x: 10, y: 10 } });
    await expect(text).toHaveCount(0);
  });

  test('a workflow package restores local media into an independent upload', async ({ page }) => {
    await clearLocalState(page);
    await page.getByTestId('workflow-new').click();
    await addWorkflowNode(page, 'io');
    await page.getByRole('button', { name: '绘制草图' }).click();
    await page.locator('.node-canvas-editor-modal canvas').click();
    await page.getByRole('button', { name: '保存到 IO 节点' }).click();
    const image = page.locator('.react-flow__node-io .node-gallery-frame-v2 img');
    await expect(image).toHaveAttribute('src', /^\/api\/files\//);
    const originalUrl = (await image.getAttribute('src'))!;
    const original = await (await page.request.get(originalUrl)).body();

    await page.getByTestId('workflow-export').click();
    const exportDialog = page.getByRole('dialog', { name: '导出工作流' });
    await expect(exportDialog).toContainText(originalUrl.split('/').at(-1)!);
    const jsonDownload = page.waitForEvent('download');
    await exportDialog.getByRole('button', { name: '仅导出 JSON' }).click();
    expect((await jsonDownload).suggestedFilename()).toMatch(/\.json$/);

    await page.getByTestId('workflow-export').click();
    const downloadPromise = page.waitForEvent('download');
    await exportDialog.getByRole('button', { name: '带素材导出 ZIP' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    const filePath = (await download.path())!;
    const archive = await readFile(filePath);
    expect(Object.keys(unzipSync(archive))).toEqual(
      expect.arrayContaining(['workflow.json', 'assets.json', expect.stringMatching(/^assets\//)]),
    );

    await page.getByTestId('workflow-import-file').setInputFiles({
      name: download.suggestedFilename(),
      mimeType: 'application/zip',
      buffer: archive,
    });
    await expect.poll(() => image.getAttribute('src')).not.toBe(originalUrl);
    await expect(image).toHaveAttribute('src', /^\/api\/files\//);
    const restored = await page.request.get((await image.getAttribute('src'))!);
    expect(await restored.body()).toEqual(original);
  });

  test('first-run discovery opens project model settings with the discovered model ready to import', async ({ page }) => {
    await page.request.post('/api/settings/reset');
    await page.route('**/api/settings/test-api', (route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            models: ['gpt-image-1-onboarding-fixture'],
            categorized: { chat: [], image: ['gpt-image-1-onboarding-fixture'], video: [] },
          },
        },
      }),
    );
    await page.goto('/');
    await page.getByPlaceholder('https://api.example.com/v1').fill('https://provider.example/v1');
    await page.getByPlaceholder('sk-...').fill('sk-onboarding-fixture');
    await page.getByRole('button', { name: '测试连接并发现模型' }).click();
    await page.getByRole('button', { name: '配置项目模型' }).click();

    await expect(page.getByTestId('settings-page')).toBeVisible();
    await expect(page.getByTestId('settings-importable-model-gpt-image-1-onboarding-fixture')).toBeVisible();
    await expect(page.getByTestId('settings-project-model-card-gpt-image-1-onboarding-fixture')).toHaveCount(0);
  });

  test('settings fields persist after reload', async ({ page }) => {
    const seed = Date.now().toString(36);
    const configName = `E2E Config ${seed}`;
    const baseUrl = `https://example-${seed}.test/v1`;
    const apiKey = `sk-e2e-${seed}`;

    await clearLocalState(page);
    await openConnectionSettings(page);
    await expect(page.locator('.splash-overlay')).toHaveCount(0);

    const configNameInput = page.getByTestId('settings-config-name-field').locator('input');
    const baseUrlInput = page.getByTestId('settings-base-url-field').locator('input');
    const apiKeyInput = page.getByTestId('settings-api-key-field').locator('input');

    await configNameInput.fill(configName);
    await baseUrlInput.fill(baseUrl);
    await apiKeyInput.fill(apiKey);

    await expect.poll(async () => {
      const persisted = await readPersistedStudioConfig(page);
      return JSON.stringify({
        name: persisted.activeConfig?.name ?? '',
        base: persisted.activeConfig?.base ?? '',
        apiKey: persisted.activeConfig?.apiKey ?? '',
        apiKeySet: Boolean(persisted.activeConfig?.apiKeySet),
      });
    }, {
      timeout: 10_000,
      intervals: [250, 500, 1_000],
    }).toBe(JSON.stringify({
      name: configName,
      base: baseUrl,
      apiKey: '',
      apiKeySet: true,
    }));

    await page.reload();
    await openConnectionSettings(page);

    await expect(configNameInput).toHaveValue(configName);
    await expect(baseUrlInput).toHaveValue(baseUrl);
    await expect(apiKeyInput).toHaveValue('');
  });

  test('workflow can add a node from the floating toolbar', async ({ page }) => {
    await clearLocalState(page);

    await expect(page.getByTestId('workflow-page')).toBeVisible();

    const beforeCount = await readStableNodeCount(page);

    await addTextInputNode(page);

    await expect(page.locator('.react-flow__node')).toHaveCount(beforeCount + 1);
  });

  test('AI V3 and IO nodes preserve their shared shell behavior and distinct types', async ({ page }) => {
    const workflowName = `E2E Shared Node Shell ${Date.now().toString(36)}`;

    await clearLocalState(page);
    await page.getByTestId('workflow-new').click();
    await page.locator('.workflow-toolbar__title--editable').click();
    await page.locator('.workflow-toolbar__title-input').fill(workflowName);
    await page.keyboard.press('Enter');

    await addWorkflowNode(page, 'io');
    await addWorkflowNode(page, 'aiV3');

    const ioNode = page.locator('.react-flow__node').filter({ hasText: 'IO' }).last();
    const aiNode = page.locator('.react-flow__node').filter({ hasText: 'AI 能力 V3' }).last();
    await expect(ioNode).toBeVisible();
    await expect(aiNode).toBeVisible();

    await aiNode.locator('.node-v2-appendix-label').click();
    await page.locator('.node-v2-appendix-label-input').fill('AI 审查节点');
    await page.keyboard.press('Enter');
    const renamedAiNode = page.locator('.react-flow__node').filter({ hasText: 'AI 审查节点' }).last();
    await expect(renamedAiNode.locator('.node-v2-appendix-label-text')).toHaveText('AI 审查节点');

    await renamedAiNode.getByTitle('锁定').click();
    await expect(renamedAiNode.getByTitle('解锁')).toBeVisible();

    await page.getByTestId('workflow-save').click();
    await expect
      .poll(async () => Boolean(await readWorkflowByName(page, workflowName)), {
        timeout: 10_000,
        intervals: [250, 500, 1_000],
      })
      .toBe(true);

    const savedWorkflow = await readWorkflowByName(page, workflowName);
    const savedDocument = await readWorkflowDocument(page, (savedWorkflow as { id: string }).id);
    const savedNodes = Array.isArray(savedDocument?.nodes) ? savedDocument.nodes : [];
    expect(savedNodes.some((node: { type?: string }) => node.type === 'io')).toBe(true);
    expect(
      savedNodes.some(
        (node: { type?: string; data?: { label?: string; locked?: boolean } }) =>
          node.type === 'aiV3' && node.data?.label === 'AI 审查节点' && node.data?.locked === true,
      ),
    ).toBe(true);
  });

  test('workflow can save and reload a created workflow', async ({ page }) => {
    const workflowName = `E2E Workflow Save ${Date.now().toString(36)}`;

    await clearLocalState(page);

    await expect(page.getByTestId('workflow-page')).toBeVisible();

    await page.getByTestId('workflow-new').click();
    await page.locator('.workflow-toolbar__title--editable').click();
    await page.locator('.workflow-toolbar__title-input').fill(workflowName);
    await page.keyboard.press('Enter');
    const beforeCount = await readStableNodeCount(page);
    await addTextInputNode(page);
    const expectedNodeCount = beforeCount + 1;
    await page.getByTestId('workflow-save').click();

    await expect
      .poll(async () => Boolean(await readWorkflowByName(page, workflowName)), {
        timeout: 10_000,
        intervals: [250, 500, 1_000],
      })
      .toBe(true);

    const savedWorkflow = await readWorkflowByName(page, workflowName);
    const workflowId = (savedWorkflow as { id?: string }).id;
    expect(typeof workflowId).toBe('string');

    const savedDocument = await readWorkflowDocument(page, workflowId as string);
    expect(savedDocument?.name).toBe(workflowName);
    expect(Array.isArray(savedDocument?.nodes) ? savedDocument.nodes.length : 0).toBe(expectedNodeCount);

    await page.reload();
    await expect(page.getByTestId('workflow-page')).toBeVisible();
    await expect(page.locator('.workflow-toolbar__title')).toHaveText(workflowName);
    await expect(page.locator('.react-flow__node')).toHaveCount(expectedNodeCount);
  });

  test('workflow can duplicate and delete a saved workflow', async ({ page }) => {
    const workflowName = `E2E Workflow Duplicate ${Date.now().toString(36)}`;

    await clearLocalState(page);

    await expect(page.getByTestId('workflow-page')).toBeVisible();

    await page.getByTestId('workflow-new').click();
    await page.locator('.workflow-toolbar__title--editable').click();
    await page.locator('.workflow-toolbar__title-input').fill(workflowName);
    await page.keyboard.press('Enter');
    await addTextInputNode(page);
    await page.getByTestId('workflow-save').click();

    await expect
      .poll(async () => Boolean(await readWorkflowByName(page, workflowName)), {
        timeout: 10_000,
        intervals: [250, 500, 1_000],
      })
      .toBe(true);
    const original = await readWorkflowByName(page, workflowName);
    const originalId = (original as { id?: string }).id;
    expect(typeof originalId).toBe('string');

    await page.getByTestId('workflow-duplicate').click();

    await expect
      .poll(
        async () => Boolean(await readDuplicateWorkflow(page, originalId as string, workflowName)),
        {
          timeout: 10_000,
          intervals: [250, 500, 1_000],
        },
      )
      .toBe(true);

    const duplicated = await readDuplicateWorkflow(page, originalId as string, workflowName);
    const duplicatedId = (duplicated as { id?: string }).id;
    expect(typeof duplicatedId).toBe('string');
    await expect(page.locator('.workflow-toolbar__title')).toHaveText((duplicated as { name: string }).name);

    await page.getByTestId('workflow-delete').click();
    const deleteDialog = page.getByRole('dialog', {
      name: `删除“${(duplicated as { name: string }).name}”？`,
    });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole('button', { name: '删除', exact: true }).click();

    await expect
      .poll(
        async () => readWorkflowExistence(page, originalId as string, duplicatedId as string),
        {
          timeout: 10_000,
          intervals: [250, 500, 1_000],
        },
      )
      .toEqual({ originalExists: true, duplicateExists: false });
  });

  test('workflow import opens a new unsaved draft tab without persisting to the library', async ({ page }) => {
    await clearLocalState(page);

    await expect(page.getByTestId('workflow-page')).toBeVisible();

    await addTextInputNode(page);
    await page.getByRole('button', { name: '保存' }).click();

    const beforeImport = await page.evaluate(async () => {
      const response = await fetch('/api/workflows');
      const payload = await response.json();
      return {
        count: payload.data?.length,
        id: payload.data?.[0]?.id,
      };
    });
    const currentWorkflowId = beforeImport.id;
    expect(typeof currentWorkflowId).toBe('string');

    const importedWorkflow = {
      id: currentWorkflowId,
      name: '冲突导入工作流',
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      nodes: [],
      edges: [],
      settings: {},
    };

    await page.getByTestId('workflow-import-file').setInputFiles({
      name: 'conflict-workflow.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(importedWorkflow), 'utf8'),
    });

    await expect(page.locator('.workflow-import-modal__dialog')).toBeVisible();
    await expect(page.getByText('已打开为新的未保存标签页。保存时会创建新的工作流记录。')).toBeVisible();
    await expect(page.getByText(/workflow\.id/)).toBeVisible();
    await expect(page.getByText('用其他方式重新导入')).toHaveCount(0);
    await expect(page.getByTestId('workflow-document-tabs')).toContainText('conflict-workflow *');

    const afterImport = await page.evaluate(async (originalId) => {
      const response = await fetch('/api/workflows');
      const payload = await response.json();
      return {
        count: payload.data?.length,
        originalCount: payload.data?.filter((workflow: { id: string }) => workflow.id === originalId).length,
      };
    }, currentWorkflowId);
    expect(afterImport).toEqual({ count: beforeImport.count, originalCount: 1 });

    await page.locator('.workflow-import-modal__button--primary').click();
    await page.getByRole('button', { name: '保存' }).click();
    await expect
      .poll(async () => {
        const response = await page.evaluate(async () => {
          const result = await fetch('/api/workflows');
          return result.json();
        });
        return response.data?.length;
      })
      .toBe((beforeImport.count || 0) + 1);
  });

  test('workflow toolbar can navigate back to settings', async ({ page }) => {
    await clearLocalState(page);

    await expect(page.getByTestId('workflow-page')).toBeVisible();

    await page.getByTestId('workflow-open-settings').click();
    await expect(page.getByTestId('settings-page')).toBeVisible();
  });

  test('workflow editing can undo a newly added node', async ({ page, browserName }) => {
    await clearLocalState(page);

    await expect(page.getByTestId('workflow-page')).toBeVisible();

    const beforeCount = await readStableNodeCount(page);

    await addTextInputNode(page);
    await expect(page.locator('.react-flow__node')).toHaveCount(beforeCount + 1);

    await page.waitForTimeout(300);
    await page.locator('[data-testid="workflow-page"]').click({ position: { x: 40, y: 40 } });
    await page.keyboard.press(browserName === 'webkit' ? 'Meta+Z' : 'Control+Z');
    await expect(page.locator('.react-flow__node')).toHaveCount(beforeCount);
  });

  test('settings connection test syncs models into import list', async ({ page }) => {
    const imageModelId = `gpt-image-1-import-fixture-${Date.now()}`;
    await clearLocalState(page);
    await openConnectionSettings(page);

    await page.route('**/api/settings/test-api', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            message: 'ok',
            models: ['gpt-4.1-mini', imageModelId],
            categorized: {
              chat: ['gpt-4.1-mini'],
              image: [imageModelId],
              video: [],
            },
          },
        }),
      });
    });

    await page.getByTestId('settings-base-url-field').locator('input').fill('https://provider.example/v1');
    await page.getByTestId('settings-api-key-field').locator('input').fill('sk-week10-test');
    await page.getByTestId('settings-provider-auth-type').selectOption('api-key');
    await page.getByTestId('settings-provider-models-endpoint').fill('/v1/models');

    await page.getByTestId('settings-test-connection').click();
    await page.getByTestId('settings-module-models').click();

    await expect(page.getByTestId('settings-importable-models-panel')).toBeVisible();
    await page.getByRole('group', { name: '类型' }).getByRole('button', { name: /图像/ }).click();
    await page.getByRole('button', { name: '全选本类型可见模型' }).click();
    await expect(page.getByTestId(`settings-importable-model-${imageModelId}`)).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('group', { name: '类型' }).getByRole('button', { name: /对话/ }).click();
    await page.getByTestId('settings-importable-model-gpt-4.1-mini').click();
    await expect(page.getByText('已选 2 个')).toBeVisible();
    await page.getByTestId('settings-import-selected-models').click();

    await page.getByRole('group', { name: '类型' }).getByRole('button', { name: /图像/ }).click();
    const imageModel = page.getByTestId(`settings-project-model-card-${imageModelId}`);
    await expect(imageModel).toBeVisible();
    await expect(page.getByRole('region', { name: '模型配置' })).toBeHidden();
    await imageModel.click();
    await expect(page.getByRole('region', { name: '模型配置' }).getByText('接口模式')).toBeVisible();

    await page.getByRole('button', { name: '批量管理' }).click();
    const batch = page.getByRole('group', { name: '批量操作' });
    await batch.getByRole('button', { name: '全选本类型', exact: true }).click();
    await expect(batch.getByText('已选 1 个')).toBeVisible();
    await batch.getByRole('button', { name: '全选匹配模型', exact: true }).click();
    await expect(batch.getByText('已选 2 个')).toBeVisible();
    await batch.getByRole('button', { name: '批量停用' }).click();
    await expect(imageModel).toContainText('已停用');
    await page.getByRole('group', { name: '类型' }).getByRole('button', { name: /对话/ }).click();
    const chatModel = page.getByTestId('settings-project-model-card-gpt-4.1-mini');
    await expect(chatModel).toContainText('已停用');
    await batch.getByRole('button', { name: '批量启用' }).click();
    await expect(chatModel).toContainText('可用');
    await page.getByRole('group', { name: '类型' }).getByRole('button', { name: /图像/ }).click();
    await expect(imageModel).toContainText('可用');
    await batch.getByRole('button', { name: '批量配置' }).click();
    const batchConfig = page.getByRole('form', { name: '批量配置' });
    await expect(batchConfig.getByRole('button', { name: '应用配置' })).toBeDisabled();
    await batchConfig.getByLabel('批量接口模式').selectOption('custom');
    await batchConfig.getByRole('checkbox', { name: '更新自定义接口路径' }).check();
    await batchConfig.getByLabel('批量自定义接口路径').fill('/v1/custom');
    await batchConfig.getByRole('button', { name: '应用配置' }).click();
    await expect(batchConfig).toBeHidden();
    await expect(batch.getByText('已选 2 个')).toBeVisible();

    await page.getByRole('button', { name: '退出批量管理' }).click();
    // The image model was open before entering batch management.
    const config = page.getByRole('region', { name: '模型配置' });
    await expect(config.getByPlaceholder('/v1/your/custom/path')).toHaveValue('/v1/custom');
    await page.getByRole('group', { name: '类型' }).getByRole('button', { name: /对话/ }).click();
    await chatModel.click();
    await expect(config.getByPlaceholder('/v1/your/custom/path')).toHaveValue('/v1/custom');

    await page.getByRole('button', { name: '批量管理', exact: true }).click();
    await batch.getByRole('button', { name: '全选匹配模型', exact: true }).click();
    await batch.getByRole('button', { name: '批量移除' }).click();
    await expect(page.locator('[data-testid^="settings-project-model-card-"]')).toHaveCount(0);
  });

  test('settings connection failure shows visible feedback and does not import phantom models', async ({ page }) => {
    await clearLocalState(page);
    await openConnectionSettings(page);

    await page.route('**/api/settings/test-api', async (route) => {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: {
            code: 'UPSTREAM_TIMEOUT',
            message: '上游连接超时',
          },
        }),
      });
    });

    await page.getByTestId('settings-base-url-field').locator('input').fill('https://provider.example/v1');
    await page.getByTestId('settings-api-key-field').locator('input').fill('sk-week15-failure');
    await page.getByTestId('settings-provider-auth-type').selectOption('api-key');
    await page.getByTestId('settings-provider-models-endpoint').fill('/v1/models');

    const failedConnection = page.waitForResponse(
      (response) => response.url().includes('/api/settings/test-api') && response.status() === 502,
    );
    await page.getByTestId('settings-test-connection').click();
    await failedConnection;

    await page.getByTestId('settings-module-diagnostics').click();
    await expect(page.getByTestId('settings-page')).toContainText('上游连接超时');
    await expect(page.getByTestId('settings-importable-models-panel')).toHaveCount(0);
    await expect(page.locator('[data-testid^="settings-project-model-card-"]')).toHaveCount(0);
  });


  test('settings exposes the reorganized primary modules', async ({ page }) => {
    await clearLocalState(page);
    await openSettings(page);
    for (const moduleId of ['overview', 'connection', 'models', 'workspace', 'diagnostics']) {
      await expect(page.getByTestId(`settings-module-${moduleId}`)).toBeVisible();
    }
    await expect(page.getByTestId('settings-module-agent')).toHaveCount(0);
    await expect(page.getByTestId('settings-module-account_details')).toHaveCount(0);
  });

});

test('资产库支持导入、整理、收藏、搜索和持久化回填', async ({ page }, testInfo) => {
  await clearLocalState(page);
  const initialNodes = await readStableNodeCount(page);
  const filename = `资产测试-${Date.now()}.png`;
  await page.getByTestId('workflow-open-assets').click();
  const dialog = page.getByRole('dialog', { name: '资产库', exact: true });
  await expect(dialog).toBeVisible();
  const panelBackgrounds = await dialog.locator('.asset-library__panel').evaluateAll((panels) =>
    panels.map((panel) => {
      const context = document.createElement('canvas').getContext('2d')!;
      context.fillStyle = getComputedStyle(panel).backgroundColor;
      context.fillRect(0, 0, 1, 1);
      return context.getImageData(0, 0, 1, 1).data[3];
    }),
  );
  expect(panelBackgrounds).toEqual([255, 255, 255, 255]);
  await dialog.getByTestId('asset-import').setInputFiles({ name: filename, mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') });
  await expect(dialog.getByRole('status')).toContainText('已导入 1 个素材');
  await dialog.getByLabel('搜索资产', { exact: true }).fill(filename);
  await dialog.getByRole('button', { name: `查看 ${filename}`, exact: true }).click();
  await dialog.getByLabel('资产名称', { exact: true }).fill(`已整理-${filename}`);
  await dialog.getByLabel('编辑分类', { exact: true }).fill('测试参考');
  await dialog.getByLabel('资产标签', { exact: true }).fill('分镜，参考');
  await dialog.getByRole('button', { name: '保存整理信息' }).click();
  await expect(dialog.getByRole('status')).toHaveText('整理信息已保存');
  await dialog.getByRole('button', { name: `收藏 已整理-${filename}`, exact: true }).click();
  await expect(dialog.getByRole('button', { name: `取消收藏 已整理-${filename}`, exact: true })).toBeVisible();
  await page.reload();
  await page.getByTestId('workflow-open-assets').click();
  await dialog.getByLabel('搜索资产', { exact: true }).fill(`已整理-${filename}`);
  await dialog.getByRole('button', { name: '仅收藏', exact: true }).click();
  await dialog.getByLabel('资产分类', { exact: true }).selectOption('测试参考');
  await dialog.getByRole('button', { name: `查看 已整理-${filename}`, exact: true }).click();
  await expect(dialog.getByLabel('资产标签', { exact: true })).toHaveValue('分镜，参考');
  await expect.poll(() => dialog.locator('.asset-library__thumbnail img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect.poll(() => dialog.locator('.asset-library__preview img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  const previewButton = dialog.getByRole('button', { name: '查看大图' });
  const largePreview = page.getByRole('dialog', { name: `已整理-${filename}`, exact: true });
  await previewButton.click();
  await expect(largePreview).toBeFocused();
  const largeImage = largePreview.getByRole('img', { name: `已整理-${filename}` });
  await expect(largeImage).toBeVisible();
  await expect.poll(() => largeImage.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await largePreview.getByRole('button', { name: '关闭大图' }).click();
  await expect(previewButton).toBeFocused();
  await previewButton.press('Enter');
  await expect(largePreview).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(largePreview).not.toBeVisible();
  await expect(previewButton).toBeFocused();
  await expect(dialog.getByLabel('资产标签', { exact: true })).toHaveValue('分镜，参考');
  await page.screenshot({ path: testInfo.outputPath('asset-library.png') });
  await dialog.getByRole('button', { name: '回填画布', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(initialNodes + 1);
  await expect.poll(() => page.evaluate(() => {
    const draft = JSON.parse(localStorage.getItem('suelr-studio-local-draft') || '{}');
    return draft.nodes?.at(-1)?.data;
  })).toMatchObject({ content: [expect.stringMatching(/^\/api\/files\//)], _fileKinds: ['image'], _fileNames: [`已整理-${filename}`] });
  await page.reload();
  await expect(page.locator('.react-flow__node')).toHaveCount(initialNodes + 1);
  // Reopening the library should not create a duplicate upload during backfill.
  await page.getByTestId('workflow-open-assets').click();
  await dialog.getByLabel('搜索资产', { exact: true }).fill(filename);
  await expect(dialog.locator('.asset-library__card')).toHaveCount(1);
  await dialog.getByRole('button', { name: `查看 已整理-${filename}`, exact: true }).focus();
  await page.keyboard.press('Delete');
  await expect(page.locator('.react-flow__node')).toHaveCount(initialNodes + 1);
  await dialog.getByRole('button', { name: `查看 已整理-${filename}`, exact: true }).click();
  await dialog.getByRole('button', { name: '删除资产', exact: true }).click();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog.locator('.asset-library__card')).toHaveCount(1);
  await dialog.getByRole('button', { name: '删除资产', exact: true }).click();
  await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('已从资产库删除');
  await expect(dialog.getByText('选择一个资产')).toBeVisible();
  await expect(dialog.locator('.asset-library__card')).toHaveCount(0);
  await dialog.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(dialog.locator('.asset-library__results')).toHaveAttribute('aria-busy', 'false');
  await expect(dialog.locator('.asset-library__card')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

test('资产库支持多选、批量编辑和批量删除', async ({ page }) => {
  await clearLocalState(page);
  const prefix = `批量资产-${Date.now()}`;
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  await page.getByTestId('workflow-open-assets').click();
  const dialog = page.getByRole('dialog', { name: '资产库', exact: true });
  const cards = dialog.locator('.asset-library__card');
  await dialog.getByTestId('asset-import').setInputFiles([1, 2, 3].map((index) => ({
    name: `${prefix}-${index}.png`, mimeType: 'image/png', buffer: image,
  })));
  await expect(dialog.getByRole('status')).toHaveText('已导入 3 个素材');
  await dialog.getByRole('textbox', { name: '搜索资产' }).fill(prefix);
  await expect(cards).toHaveCount(3);
  await dialog.getByRole('button', { name: '多选', exact: true }).click();
  await dialog.getByRole('button', { name: '全选本页' }).click();
  await expect(dialog.getByText('本页已选 3 项')).toBeVisible();
  await dialog.getByRole('button', { name: `选择 ${prefix}-3.png` }).click();
  const archiveDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '下载所选资产' }).click();
  const downloaded = await archiveDownload;
  const archive = unzipSync(await readFile((await downloaded.path())!));
  expect(Object.keys(archive)).toHaveLength(2);
  expect(Object.keys(archive).some((name) => name.endsWith(`${prefix}-3.png`))).toBe(false);
  for (const bytes of Object.values(archive)) expect(Buffer.from(bytes)).toEqual(image);
  await dialog.getByRole('checkbox', { name: '修改分类' }).check();
  await dialog.getByRole('textbox', { name: '批量分类' }).fill(prefix);
  await dialog.getByRole('checkbox', { name: '替换标签' }).check();
  await dialog.getByRole('textbox', { name: '批量标签' }).fill('分镜，参考');
  await dialog.getByRole('button', { name: '保存批量编辑' }).click();
  await expect(dialog.getByRole('status')).toHaveText('已更新 2 个资产');
  await dialog.getByLabel('资产分类', { exact: true }).selectOption(prefix);
  await expect(cards).toHaveCount(2);
  await dialog.getByRole('button', { name: '全选本页' }).click();
  await dialog.getByRole('button', { name: '批量删除', exact: true }).click();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(cards).toHaveCount(2);
  await dialog.getByRole('button', { name: '批量删除', exact: true }).click();
  await dialog.getByRole('button', { name: '确认批量删除' }).click();
  await expect(dialog.getByRole('status')).toHaveText('已从资产库删除 2 个资产');
  await dialog.getByLabel('资产分类', { exact: true }).selectOption('');
  await expect(cards).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: `选择 ${prefix}-3.png` })).toBeVisible();
});
