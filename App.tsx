/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
// Copyright 2024 Google LLC

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     https://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import c from 'classnames';
import {useRef, useState, useMemo}from 'react';
import {generateContent, uploadFile} from './api';
import Chart from './Chart.jsx';
import functions from './functions';
import modes from './modes';
import {timeToSecs} from './utils';
import VideoPlayer from './VideoPlayer.jsx';

// FIX: Create a specific type for mode keys to ensure type safety. This resolves errors on lines 170 and 366.
type ModeKey = keyof typeof modes;

const chartModes = Object.keys(modes.Chart.subModes);

// FIX: Define an interface for timecode items to ensure type safety.
interface Timecode {
  time: string;
  text?: string;
  objects?: string[];
  value?: number;
}

export default function App() {
  const [vidUrl, setVidUrl] = useState<string | null>(null);
  const [file, setFile] = useState<any>(null);
  // FIX: Use the Timecode interface for the timecodeList state.
  const [timecodeList, setTimecodeList] = useState<Timecode[] | null>(null);
  const [requestedTimecode, setRequestedTimecode] = useState<number | null>(null);
  // FIX: Apply the ModeKey type to the selectedMode state.
  const [selectedMode, setSelectedMode] = useState<ModeKey>(
    Object.keys(modes)[0] as ModeKey,
  );
  // FIX: Apply the ModeKey type to the activeMode state.
  const [activeMode, setActiveMode] = useState<ModeKey>();
  const [isLoading, setIsLoading] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [chartMode, setChartMode] = useState(chartModes[0]);
  const [chartPrompt, setChartPrompt] = useState('');
  const [chartLabel, setChartLabel] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [theme] = useState(
    window.matchMedia('(prefers-color-scheme: dark)').matches ?
      'dark' :
      'light',
  );
  const scrollRef = useRef<HTMLElement>(null);
  const isCustomMode = selectedMode === 'Custom';
  const isChartMode = selectedMode === 'Chart';
  const isCustomChartMode = isChartMode && chartMode === 'Custom';
  const hasSubMode = isCustomMode || isChartMode;

  const filteredTimecodeList = useMemo(() => {
    if (!timecodeList) return null;
    if (!searchQuery.trim()) return timecodeList;

    return timecodeList.filter((item) => {
      const query = searchQuery.toLowerCase();
      const textMatch = item.text?.toLowerCase().includes(query);
      const objectsMatch = item.objects
        ?.join(', ')
        .toLowerCase()
        .includes(query);
      const valueMatch = item.value?.toString().toLowerCase().includes(query);
      return textMatch || objectsMatch || valueMatch;
    });
  }, [timecodeList, searchQuery]);

  const setTimecodes = ({timecodes}: {timecodes: Timecode[]}) =>
    setTimecodeList(
      // FIX: Use `replace` with a global regex instead of `replaceAll` for broader compatibility.
      timecodes.map((t) => ({...t, text: t.text!.replace(/\\'/g, "'")})),
    );

  // FIX: Refactored prompt generation to use type guards, resolving issues with callable expressions and property access on union types. This resolves errors on lines 104, 106, and 107.
  const onModeSelect = async (mode: ModeKey) => {
    setSearchQuery('');
    setActiveMode(mode);
    setIsLoading(true);
    setChartLabel(chartPrompt);

    const modeConfig = modes[mode];
    let promptText: string;

    if (typeof modeConfig.prompt === 'function') {
      if ('subModes' in modeConfig) {
        // This is Chart mode
        const chartInput = isCustomChartMode
          ? chartPrompt
          : modeConfig.subModes[chartMode];
        promptText = modeConfig.prompt(chartInput);
      } else {
        // This is Custom mode
        promptText = modeConfig.prompt(customPrompt);
      }
    } else {
      promptText = modeConfig.prompt;
    }

    const resp = await generateContent(
      promptText,
      functions({
        set_timecodes: setTimecodes,
        set_timecodes_with_objects: setTimecodes,
        set_timecodes_with_numeric_values: ({
          timecodes,
        }: {
          timecodes: Timecode[];
        }) => setTimecodeList(timecodes),
      }),
      file,
    );

    const call = resp.functionCalls?.[0];

    if (call) {
      ({
        set_timecodes: setTimecodes,
        set_timecodes_with_objects: setTimecodes,
        set_timecodes_with_numeric_values: ({
          timecodes,
        }: {
          timecodes: Timecode[];
        }) => setTimecodeList(timecodes),
      })[call.name](call.args);
    }

    setIsLoading(false);
    scrollRef.current?.scrollTo({top: 0});
  };

  const uploadVideo = async (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsLoadingVideo(true);
    setVideoError(false);

    const droppedFile = e.dataTransfer.files[0];

    if (!droppedFile) {
      setIsLoadingVideo(false);
      return;
    }

    if (!droppedFile.type.startsWith('video/')) {
      setVideoError(true);
      setIsLoadingVideo(false);
      setVidUrl(null);
      return;
    }

    setVidUrl(URL.createObjectURL(droppedFile));

    try {
      const res = await uploadFile(droppedFile);
      setFile(res);
      setIsLoadingVideo(false);
    } catch (e) {
      setVideoError(true);
      setIsLoadingVideo(false);
    }
  };

  const handleExport = (format: 'csv' | 'md') => {
    if (!timecodeList || !activeMode) return;

    let content = '';
    const fileExtension = format;
    const mimeType = `text/${
      format === 'md' ? 'markdown' : 'csv'
    };charset=utf-8;`;
    const fileName = `${activeMode
      .toLowerCase()
      .replace(/[\s/]/g, '-')}-export.${fileExtension}`;

    const sanitizeCsv = (text: string) => `"${text.replace(/"/g, '""')}"`;
    const sanitizeMd = (text: string) =>
      text.replace(/\|/g, '\\|').replace(/\n/g, '<br>');

    if (format === 'csv') {
      if (activeMode === 'Table') {
        const headers = ['Time', 'Description', 'Objects'];
        content = [
          headers.join(','),
          ...timecodeList.map((item) =>
            [
              item.time,
              sanitizeCsv(item.text!),
              sanitizeCsv(item.objects!.join(', ')),
            ].join(','),
          ),
        ].join('\n');
      } else if (activeMode === 'Chart') {
        const headers = ['Time', 'Value'];
        content = [
          headers.join(','),
          ...timecodeList.map((item) => [item.time, item.value].join(',')),
        ].join('\n');
      } else {
        const headers = ['Time', 'Text'];
        content = [
          headers.join(','),
          ...timecodeList.map((item) =>
            [item.time, sanitizeCsv(item.text!)].join(','),
          ),
        ].join('\n');
      }
    } else if (format === 'md') {
      content = `# ${activeMode} Export\n\n`;
      if (activeMode === 'Table') {
        const headers = ['Time', 'Description', 'Objects'];
        content += `| ${headers.join(' | ')} |\n`;
        content += `| ${headers.map(() => '---').join(' | ')} |\n`;
        content += timecodeList
          .map((item) =>
            `| ${item.time} | ${sanitizeMd(item.text!)} | ${sanitizeMd(
              item.objects!.join(', '),
            )} |`,
          )
          .join('\n');
      } else if (activeMode === 'Chart') {
        content += `## ${chartLabel || 'Chart Data'}\n\n`;
        content += timecodeList
          .map((item) => `- **${item.time}**: ${item.value}`)
          .join('\n');
      } else {
        content += timecodeList
          .map((item) => `- **[${item.time}]** ${sanitizeMd(item.text!)}`)
          .join('\n');
      }
    }

    const blob = new Blob([content], {type: mimeType});
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <main
      className={theme}
      onDrop={uploadVideo}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={() => {}}
      onDragLeave={() => {}}>
      <section className="top">
        {vidUrl && !isLoadingVideo && (
          <>
            <div className={c('modeSelector', {hide: !showSidebar})}>
              {hasSubMode ? (
                <>
                  <div>
                    {isCustomMode ? (
                      <>
                        <h2>Custom prompt:</h2>
                        <textarea
                          placeholder="Type a custom prompt..."
                          value={customPrompt}
                          onChange={(e) => setCustomPrompt(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              onModeSelect(selectedMode);
                            }
                          }}
                          // FIX: The rows attribute expects a number, not a string.
                          rows={5}
                        />
                      </>
                    ) : (
                      <>
                        <h2>Chart this video by:</h2>

                        <div className="modeList">
                          {chartModes.map((mode) => (
                            <button
                              key={mode}
                              className={c('button', {
                                active: mode === chartMode,
                              })}
                              onClick={() => setChartMode(mode)}>
                              {mode}
                            </button>
                          ))}
                        </div>
                        <textarea
                          className={c({active: isCustomChartMode})}
                          placeholder="Or type a custom prompt..."
                          value={chartPrompt}
                          onChange={(e) => setChartPrompt(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              onModeSelect(selectedMode);
                            }
                          }}
                          onFocus={() => setChartMode('Custom')}
                          // FIX: The rows attribute expects a number, not a string.
                          rows={2}
                        />
                      </>
                    )}
                    <button
                      className="button generateButton"
                      onClick={() => onModeSelect(selectedMode)}
                      disabled={
                        (isCustomMode && !customPrompt.trim()) ||
                        (isChartMode &&
                          isCustomChartMode &&
                          !chartPrompt.trim())
                      }>
                      ▶️ Generate
                    </button>
                  </div>
                  <div className="backButton">
                    <button
                      onClick={() =>
                        setSelectedMode(Object.keys(modes)[0] as ModeKey)
                      }>
                      <span className="icon">chevron_left</span>
                      Back
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <h2>Explore this video via:</h2>
                    <div className="modeList">
                      {Object.entries(modes).map(([mode, {emoji}]) => (
                        <button
                          key={mode}
                          className={c('button', {
                            active: mode === selectedMode,
                          })}
                          onClick={() => setSelectedMode(mode as ModeKey)}>
                          <span className="emoji">{emoji}</span> {mode}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <button
                      className="button generateButton"
                      onClick={() => onModeSelect(selectedMode)}>
                      ▶️ Generate
                    </button>
                  </div>
                </>
              )}
            </div>
            <button
              className="collapseButton"
              onClick={() => setShowSidebar(!showSidebar)}>
              <span className="icon">
                {showSidebar ? 'chevron_left' : 'chevron_right'}
              </span>
            </button>
          </>
        )}

        <VideoPlayer
          url={vidUrl}
          requestedTimecode={requestedTimecode}
          timecodeList={timecodeList}
          jumpToTimecode={setRequestedTimecode}
          isLoadingVideo={isLoadingVideo}
          videoError={videoError}
        />
      </section>

      <div className={c('tools', {inactive: !vidUrl})}>
        <section
          className={c('output', {['mode' + activeMode]: activeMode})}
          ref={scrollRef}>
          {timecodeList && !isLoading && (
            <div className="output-controls">
              <div className="search-bar">
                <span className="icon">search</span>
                <input
                  type="text"
                  placeholder="Search results..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="export-buttons">
                <button
                  className="button export-button"
                  onClick={() => handleExport('csv')}>
                  <span className="icon">download</span>
                  Export CSV
                </button>
                <button
                  className="button export-button"
                  onClick={() => handleExport('md')}>
                  <span className="icon">download</span>
                  Export MD
                </button>
              </div>
            </div>
          )}
          {isLoading ? (
            <div className="loading">
              Waiting for model<span>...</span>
            </div>
          ) : filteredTimecodeList && filteredTimecodeList.length > 0 ? (
            activeMode === 'Table' ? (
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Description</th>
                    <th>Objects</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTimecodeList.map(({time, text, objects}, i) => (
                    <tr
                      key={i}
                      role="button"
                      onClick={() => setRequestedTimecode(timeToSecs(time))}>
                      <td>
                        <time>{time}</time>
                      </td>
                      <td>{text}</td>
                      <td>{objects!.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : activeMode === 'Chart' ? (
              <Chart
                data={timecodeList as {time: string, value: number}[]}
                yLabel={chartLabel}
                jumpToTimecode={setRequestedTimecode}
              />
            ) : // FIX: Use the 'in' operator to safely check for the `isList` property. This resolves an access error on a union type.
            activeMode && 'isList' in modes[activeMode] && modes[activeMode].isList ? (
              <ul>
                {filteredTimecodeList.map(({time, text}, i) => (
                  <li key={i} className="outputItem">
                    <button
                      onClick={() => setRequestedTimecode(timeToSecs(time))}>
                      <time>{time}</time>
                      <p className="text">{text}</p>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              filteredTimecodeList.map(({time, text}, i) => (
                <>
                  <span
                    key={i}
                    className="sentence"
                    role="button"
                    onClick={() => setRequestedTimecode(timeToSecs(time))}>
                    <time>{time}</time>
                    <span>{text}</span>
                  </span>{' '}
                </>
              ))
            )
          ) : timecodeList ? (
            <div className="no-results">
              No results found for "{searchQuery}"
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
