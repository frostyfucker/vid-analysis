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

import {max, min} from 'd3-array';
import {scaleBand, scaleLinear} from 'd3-scale';
import {line} from 'd3-shape';
import {useEffect, useRef, useState} from 'react';
import {timeToSecs} from './utils';

// FIX: Define interfaces for data points and component props to ensure type safety. This resolves errors on lines 41, 48, and 49.
interface ChartDataPoint {
  time: string;
  value: number;
}

interface ChartProps {
  data: ChartDataPoint[];
  yLabel: string;
  jumpToTimecode: (seconds: number) => void;
}

export default function Chart({data, yLabel, jumpToTimecode}: ChartProps) {
  const chartRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(1);
  const [height, setHeight] = useState(1);
  const margin = 55;
  const xMax = width;
  const yMax = height - margin;
  const xScale = scaleBand()
    .range([margin + 10, xMax])
    .domain(data.map((d) => d.time))
    .padding(0.2);

  const vals = data.map((d) => d.value);
  const yScale = scaleLinear()
    // FIX: Add nullish coalescing to handle cases where min/max might return undefined (e.g., empty data array). This resolves error on line 41.
    .domain([min(vals) ?? 0, max(vals) ?? 1])
    .nice()
    .range([yMax, margin]);

  const yTicks = yScale.ticks(Math.floor(height / 70));

  // FIX: Provide a generic type to the line generator to correctly type the data points. This resolves errors on lines 48 and 49.
  const lineGen = line<ChartDataPoint>()
    .x((d) => xScale(d.time)!)
    .y((d) => yScale(d.value));

  useEffect(() => {
    const setSize = () => {
      if (chartRef.current) {
        setWidth(chartRef.current.clientWidth);
        setHeight(chartRef.current.clientHeight);
      }
    };

    setSize();
    addEventListener('resize', setSize);
    return () => removeEventListener('resize', setSize);
  }, []);

  return (
    <svg className="lineChart" ref={chartRef}>
      <g className="axisLabels" transform={`translate(0 ${0})`}>
        {yTicks.map((tick) => {
          const y = yScale(tick);

          return (
            <g key={tick} transform={`translate(0 ${y})`}>
              <text x={margin - 10} dy="0.25em" textAnchor="end">
                {tick}
              </text>
            </g>
          );
        })}
      </g>

      <g
        className="axisLabels timeLabels"
        transform={`translate(0 ${yMax + 40})`}>
        {data.map(({time}, i) => {
          return (
            <text
              key={i}
              x={xScale(time)}
              role="button"
              onClick={() => jumpToTimecode(timeToSecs(time))}>
              {time.length > 5 ? time.replace(/^00:/, '') : time}
            </text>
          );
        })}
      </g>

      <g>
        <path d={lineGen(data)} />
      </g>

      <g>
        {data.map(({time, value}, i) => {
          return (
            <g
              key={i}
              className="dataPoint"
              role="button"
              onClick={() => jumpToTimecode(timeToSecs(time))}>
              <circle cx={xScale(time)} cy={yScale(value)} r={4} />

              <text x={xScale(time)} y={yScale(value) - 12}>
                {value}
              </text>
            </g>
          );
        })}
      </g>

      <text
        className="axisTitle"
        x={margin}
        y={-width + margin}
        transform="rotate(90)">
        {yLabel}
      </text>
    </svg>
  );
}
