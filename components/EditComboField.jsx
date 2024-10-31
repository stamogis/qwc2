/**
 * Copyright 2024 Sourcepole AG
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';

import PropTypes from 'prop-types';
import { v5 as uuidv5 } from 'uuid';

import LocaleUtils from '../utils/LocaleUtils';

const UUID_NS = '5ae5531d-8e21-4456-b45d-77e9840a5bb7';

export class KeyValCache {
    static store = {};
    static requests = {};
    static get = (editIface, keyvalrel, filterExpr, callback) => {
        const key = keyvalrel +  uuidv5(JSON.stringify(filterExpr ?? null), UUID_NS);
        if (key in this.store) {
            callback(this.store[key]);
        } else if (key in this.requests) {
            this.requests[key].push(callback);
        } else {
            this.requests[key] = [callback];
            editIface.getKeyValues(keyvalrel, (result) => {
                if (key in this.requests) {
                    const dataSet = keyvalrel.split(":")[0];
                    if (result.keyvalues && result.keyvalues[dataSet]) {
                        const values = result.keyvalues[dataSet].map(entry => ({
                            value: entry.key, label: entry.value
                        }));
                        this.store[key] = values;
                    } else {
                        this.store[key] = [];
                    }
                    this.requests[key].forEach(cb => cb(this.store[key]));
                    delete this.requests[key];
                }
            }, filterExpr ? [filterExpr] : null);
        }
    };
    static getSync = (keyvalrel, filterExpr) => {
        const key = keyvalrel +  uuidv5(JSON.stringify(filterExpr ?? null), UUID_NS);
        if (key in this.store) {
            return this.store[key];
        } else {
            return [];
        }
    };
    static clear = () => {
        this.store = {};
        this.requests = {};
    };
}


export default class EditComboField extends React.Component {
    static propTypes = {
        editIface: PropTypes.object,
        fieldId: PropTypes.string,
        filterExpr: PropTypes.array,
        keyvalrel: PropTypes.string,
        name: PropTypes.string,
        placeholder: PropTypes.string,
        readOnly: PropTypes.bool,
        required: PropTypes.bool,
        style: PropTypes.object,
        updateField: PropTypes.func,
        value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        values: PropTypes.array
    };
    state = {
        showPlaceholder: true,
        values: []
    };
    componentDidMount() {
        if (this.props.values) {
            // eslint-disable-next-line
            this.setState({values: this.props.values, showPlaceholder: !this.hasEmptyValue(this.props.values)});
        } else if (this.props.keyvalrel) {
            KeyValCache.get(this.props.editIface, this.props.keyvalrel, this.props.filterExpr ?? null, (values) => {
                // eslint-disable-next-line
                this.setState({values, showPlaceholder: !this.hasEmptyValue(values)});
            });
        }
    }
    componentDidUpdate(prevProps) {
        if (this.props.keyvalrel && this.props.filterExpr !== prevProps.filterExpr) {
            KeyValCache.get(this.props.editIface, this.props.keyvalrel, this.props.filterExpr ?? null, (values) => {
                // eslint-disable-next-line
                this.setState({values, showPlaceholder: !this.hasEmptyValue(values)});
            });
        }
    }
    hasEmptyValue = (values) => {
        for (let i = 0; i < values.length; ++i) {
            if (typeof(values[i]) === 'string') {
                if (values[i] === '') {
                    return true;
                }
            } else if (values[i].value === '') {
                return true;
            }
        }
        return false;
    };
    render() {
        return (
            <select disabled={this.props.readOnly} name={this.props.name}
                onChange={ev => this.props.updateField(this.props.fieldId, ev.target.selectedIndex === 0 && this.state.showPlaceholder ? null : ev.target.value)}
                required={this.props.required} style={this.props.style} value={String(this.props.value)}
            >
                {this.state.showPlaceholder ? (
                    <option disabled={this.props.required} value="">
                        {this.props.placeholder ?? LocaleUtils.tr("editing.select")}
                    </option>
                ) : null}
                {this.state.values.map((item, index) => {
                    let optValue = "";
                    let label = "";
                    if (typeof(item) === 'string') {
                        optValue = label = item;
                    } else {
                        optValue = item.value;
                        label = item.label;
                    }
                    return (
                        <option key={this.props.fieldId + index} value={String(optValue)}>{label}</option>
                    );
                })}
            </select>
        );
    }
}
