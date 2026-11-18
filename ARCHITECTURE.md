# Архитектура и проверка

Исходники разделены по ответственности. Eco-Retreat.html — сгенерированная автономная поставка, не исходник для ручной правки. При разработке можно открывать index.html с соседними файлами. Three.js r160 оставлен локальным: смена движка не нужна. Обычные скрипты и пространство имён Eco сохраняют работу через file:// без сервера, npm и загрузок из CDN.

## Модули

| Файл | Ответственность |
| --- | --- |
| model.js | Исходная приблизительная геометрия квартиры |
| model-state.js | Проверка, копирование данных, нормализация версии 2, уникальные ID |
| collisions.js | Поворотные прямоугольники, пересечения, коллизия с радиусом человека |
| furniture-snap.js | Магнитная привязка к близким граням мебели с проверкой стен и пересечений |
| geometry.js | Примитивы, материалы, текстуры, освобождение ресурсов |
| furniture-catalog.js | 81 вариант мебели (кухонные модули kitchen-mesh + базовые предметы) |
| kitchen-mesh.js | Геометрия кухонных модулей и техники |
| furniture-mesh.js | Генератор предмета; корпус отдельно от аксессуаров |
| apartment-scene.js | Стены и полы; точечное согласование мебели по ID |
| renderer.js | WebGL, камеры, свет и тени |
| navigation.js | Прогулка, орбита, перемещение и масштаб камеры |
| previews.js | Превью из того же генератора, что используется в сцене |
| reference-viewer.js | Масштабирование и перемещение исходной картинки |
| furnish.js | Каталог в интерфейсе, выбор, перемещение, история действий |
| measure.js | Рулетка и размерный SVG-план |
| app.js | Связывание модулей, ввод, режимы, импорт и экспорт |

## Контракты

- Координаты в метрах: X/Z — пол, Y — высота. У предмета необязательное поле y задаёт высоту низа над полом, по умолчанию 0. Поворот вокруг Y в радианах.
- makeFurniture создаёт только объекты Three.js; не регистрирует коллизии и не меняет модель квартиры. Корпус нормализуется под w/d/h; аксессуары располагаются над ним и не определяют высоту столешницы.
- Версия JSON остаётся 2. ID — дополнительное поле. Дублирующиеся или отсутствующие ID нормализуются на копии входных данных. Поле h у старых столов теперь корректно задаёт высоту столешницы: их видимая высота может измениться относительно предыдущей ошибочной версии.
- Импорт: копия → полная проверка → построение отдельной сцены → замена живой сцены → освобождение старых ресурсов. Ошибка проверки или построения сохраняет действующие данные, историю и сцену.
- Добавление, удаление, поворот, перемещение и изменение размеров не пересоздают стены/полы. Для неизменённого типа/размера/цвета остаются прежние геометрии; позиция и поворот обновляются непосредственно. Размер или цвет заменяет только выбранный предмет. Отмена/повтор используют тот же механизм.
- Предупреждения расстановки и коллизии прогулки учитывают поворот. Это прямоугольные габариты, а не точная физика ножек столов и открывания дверей. Ковры не мешают прогулке; растения имеют препятствие по габариту.
- Модель автосохраняется в `localStorage` (ключ `eco-retreat.model.v2`, запись дебатится 600 мс и дописывается на `pagehide`) и восстанавливается при открытии; повреждённая запись молча игнорируется. Ручные экспорт/импорт JSON остаются и тоже пишут автосохранение. Отмена хранит обратные операции и переживает перестроение модели. Внешних отправок и автозагрузки в GitHub нет.

## Команды из корня проекта (Node.js ≥ 18)

```sh
node --version                         # требуется Node.js ≥ 18
node work/check-model.cjs             # полный сценарий: сцена, перемещение, коллизия, план, рулетка, каталог, магнитная стыковка
node work/check-refactor.cjs          # сохранность стен/ID при редактировании, некорректный импорт, ориентированные коллизии
node work/check-kitchen.cjs           # кухонные модули, интегрированные столешницы, высота установки (Y)
node work/check-camera.cjs            # орбита и панорамирование по полу в 3D и виде сверху
node work/check-floor-depth.cjs       # овlaрlapped пол участkii не remain coplanar, аnizотropy и глубinа range по реjimo
node work/audit-draw-calls.cjs        # измерить draw calls и shadow casters: default layout и до 500 objects
node work/audit-layout.cjs            # выявляет мебель, пересекающую стены
npm test                              # запустить всё сразу + проверку bundle-дрифта
```

Сборка (упаковка):

```sh
npm run build           # создаёт Eco-Retreat.html в корне проекта
npm run check:bundle    # проверяет: перепакованный HTML точно совпадает с зафиксированным
```

Для архивации готового файла: `mkdir -p outputs && tar -czf outputs/Eco-Retreat-v2.tar.gz Eco-Retreat.html`

Сборка читает список CSS/JS из index.html, поэтому новая зависимость не требует второго списка в скрипте сборки. reference.png встраивается в автономный HTML.

Тесты проверяют старые взаимодействия, 81 вариант мебели, магнитную стыковку, реальные геометрические габариты, сохранность стен при редактировании, ID/историю, некорректный импорт и исключение при построении, повёрнутые коллизии. `npm run check:bundle` сравнивает собранный в памяти HTML с файлом в репозитории и не перезаписывает его; `npm test` дополнительно запускает сценарий против встроенных скриптов готового HTML. Используется настоящая геометрия Three.js, но WebGLRenderer и DOM подменены. Это не тест пикселей, реальных диалогов и производительности GPU.

Continuous integration (`.github/workflows/test.yml`, badge in README) runs the same headless commands on Ubuntu across Node 18, 20, 22 and 24. Each leg first asserts that the Node it claims is really the one it runs, because 18 and 20 are EOL and no longer preinstalled on the image. `Array.prototype.at()` is used nowhere in the checkers, so nothing depends on an engine convenience method that arrives later than the declared floor.

## Rendering budget and what enforces it

- **Draw calls.** `work/audit-draw-calls.cjs` measures the scene: the default layout costs 378 draw calls (226 meshes + 152 shadow casters), the largest layout the validator accepts (500 objects) — 3477 (2304 + 1173). These numbers are regression guards, not benchmarks: there is no GPU here. Deliberately did not switch to InstancedMesh: named parts (the app finds them by name) and glass parts (the app toggles them separately) do not survive merging into one instance, and per-object meshes are used by `syncFurniture` and undo/redo.
- **Shadow map.** `autoUpdate = false` (the room is nearly static), so every path that changes geometry, visibility or mode must raise `needsUpdate` itself. `work/check-model.cjs` counts invalidations per path (three modes, wall cut, furniture visibility, labels, import, resize, reset to the original layout, add, drag, rotate, delete, undo, redo). Missed paths become stale shadows, not errors.
- **Sky environment.** It only works when pre-filtered: r160 samples `scene.environment` as a cube or CubeUV atlas (the shader's `ENVMAP_TYPE` is taken from `texture.mapping`), so a raw equirectangular canvas texture compiles a shader that reads `sampler2D` through `samplerCube` and reflects nothing at all. `prefilterEnvironment` builds a PMREM map and releases the generator and the source; if the buffer cannot be allocated, the scene gets no environment and is lit only by lights.
- **Floor patches.** Room rectangles in the sketch were drawn across walls and doorways, so four pairs of patches cover the same ground (`audit-layout.cjs` measures furniture against walls, this one measures floors against floors): the corridor into the wardrobe, the wardrobe into the master bedroom, the bathroom threshold, the strip past the bedroom-2 partition. Coplanar patches at one height cannot be ranked by the depth buffer, so the pair swaps every frame and the floor flickers while the camera turns. `apartment-scene.js` lifts a patch that still covers an earlier one by 3 mm per overlap, so paint order becomes real geometry; `work/check-floor-depth.cjs` re-measures the built scene: no coplanar pair remains, the total lift stays under 8 mm (half a grout line, so the seam and the furniture feet do not change read), and the ground covered is unchanged. The wall boxes and the merged shell from `closeWallJoints()` are exactly coplanar too, but one material and one normal across both means nothing visible can fight, so the shell is left as the thing that closes steps in thickness at corners.
- **Depth range per mode.** `navigation.js` gives each mode the range its camera can actually see — orbit 0,12..60 m, walk 0,05..40 m — instead of one 0,03..150 m range. Depth precision belongs to that ratio: at the farthest corner the old range left a 5,7 mm step, coarser than the 3 mm lift, so the fix above would still have lost there. The assertion is written as a depth step against a 24-bit buffer (what Chromium reports for the app's WebGL2 drawing buffer), not as one fixed width.
- **Anisotropic floors.** A 512 px map of planks and grout minified without anisotropy jumps mip level every frame the camera turns, which reads as shimmer over the floor. `renderer.js` hands the driver's ceiling to `geometry.js`, which caps it at 8 samples; floors clone the base maps, and `Texture.copy()` carries `anisotropy` across.
- **Materials.** `envMapIntensity` = `0.35 + metalness * 0.7` (`geometry.js`): a fixed 0.35 left surfaces with metalness 0.55 looking matte, no matter how bright the environment is. Values passed explicitly take priority.
- **Previews.** One off-screen context for all previews; the buffer is sized by the card and device density (clamped at 260–512 px, aspect 13/9), not by the old constant 260×180. When the target changes, the previous context is released and not left resident.
- **Shadow casters.** A merged mesh casts if at least one of its parts casts; thin foils and dust-sized chips do not cast (`solid()` in `geometry.js`); rugs and items composed only of such parts do not cast. `audit-draw-calls.cjs` asserts this policy for all 81 variants of the catalog, so shadows cannot silently change with the geometry.

## Ручная приёмка в браузере

1. До обновления сохранить свою расстановку в JSON; после обновления загрузить обратно.
2. Открыть 3D и каталог: проверить превью, полупрозрачную установку, Alt-поворот камеры и перетаскивание. Поднести шкаф к шкафу и стул к столу, проверить магнит и его отключение через Ctrl.
3. Добавить обеденный стол высотой 0,75 м: столешница должна быть на этой высоте, ваза — выше.
4. Повернуть длинный предмет на 45° и пройти рядом с его свободным углом.
5. Загрузить испорченный JSON: должна появиться понятная ошибка, существующая квартира — остаться.
6. Проверить 2D-план, рулетку, источник изображения, отмену и экспорт/импорт.
7. Пpoвить 3D и повернy камерy по кругe (Alt) и по полу: пол не must shimmer and no patch swaps across wall и doorway — по wardrobe doorway, wardrobe into master bedroom, bathroom threshold, strip past bedroom-2 partition. Grout и planks must stay quiet grazing the floor, not jump mip level.

Точность планировки по-прежнему ограничена исходным рендером; рефакторинг не превращает её в обмерный чертёж.

## Примечание о Git

В этом копировании нет `.git` (проект загружен как архив/снимок). После установки `git`:
1. Установите git (`sudo apt install git` / `brew install git` / с сайта git-scm.com)
2. Склонируйте репозиторий заново: `git clone https://github.com/KieuNghia/eco-retreat-3d.git`
Это позволит вести историю изменений, создавать ветки и использовать `git` для работы с проектом.
