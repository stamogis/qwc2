/**
 * Copyright 2017-2021 Sourcepole AG
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import isEmpty from 'lodash.isempty';
import clone from 'clone';
import uuid from 'uuid';
import {setEditContext, clearEditContext} from '../actions/editing';
import {setCurrentTaskBlocked} from '../actions/task';
import {LayerRole, refreshLayer} from '../actions/layers';
import AutoEditForm from './AutoEditForm';
import LinkFeatureForm from './LinkFeatureForm';
import QtDesignerForm from './QtDesignerForm';
import ButtonBar from './widgets/ButtonBar';
import CoordinatesUtils from '../utils/CoordinatesUtils';
import LocaleUtils from '../utils/LocaleUtils';
import './style/AttributeForm.css';

class AttributeForm extends React.Component {
    static propTypes = {
        clearEditContext: PropTypes.func,
        deleteMsgId: PropTypes.string,
        editConfig: PropTypes.object,
        editContext: PropTypes.object,
        iface: PropTypes.object,
        map: PropTypes.object,
        newfeature: PropTypes.bool,
        refreshLayer: PropTypes.func,
        setCurrentTaskBlocked: PropTypes.func,
        setEditContext: PropTypes.func,
        theme: PropTypes.object,
        touchFriendly: PropTypes.bool
    }
    static defaultProps = {
        deleteMsgId: LocaleUtils.trmsg("editing.delete"),
        touchFriendly: true
    }
    state = {
        busy: false,
        deleteClicked: false,
        childEdit: null
    }
    componentDidUpdate(prevProps) {
        if (prevProps.editContext.changed !== this.props.editContext.changed) {
            this.props.setCurrentTaskBlocked(this.props.editContext.changed === true);
        }
        if ((!this.props.editContext.feature || this.props.editContext.changed) && this.state.deleteClicked) {
            this.setState({deleteClicked: false});
        }
    }
    editLayerId = (layerId) => {
        return this.props.editConfig || layerId;
    }
    render = () => {
        let commitBar = null;
        if (this.props.editContext.changed) {
            const commitButtons = [
                {key: 'Commit', icon: 'ok', label: LocaleUtils.trmsg("editing.commit"), extraClasses: "attrib-form-commit", type: "submit"},
                {key: 'Discard', icon: 'remove', label: LocaleUtils.trmsg("editing.discard"), extraClasses: "attrib-form-discard"}
            ];
            commitBar = (<ButtonBar buttons={commitButtons} onClick={this.onDiscard}/>); /* submit is handled via onSubmit in the form */
        }

        const curConfig = this.props.editConfig;
        const editPermissions = curConfig.permissions || {};
        const readOnly = editPermissions.updatable === false;

        let deleteBar = null;
        if (!this.props.newfeature && this.props.editContext.feature && !this.props.editContext.changed && editPermissions.deletable !== false) {
            // Delete button bar will appear by default if no permissions are defined in editConfig or when deletable permission is set
            if (!this.state.deleteClicked) {
                const deleteButtons = [
                    {key: 'Delete', icon: 'trash', label: this.props.deleteMsgId}
                ];
                deleteBar = (<ButtonBar buttons={deleteButtons} onClick={this.deleteClicked} />);
            } else {
                const deleteButtons = [
                    {key: 'Yes', icon: 'ok', label: LocaleUtils.trmsg("editing.reallydelete"), extraClasses: "attrib-form-commit"},
                    {key: 'No', icon: 'remove', label: LocaleUtils.trmsg("editing.canceldelete"), extraClasses: "attrib-form-discard"}
                ];
                deleteBar = (<ButtonBar buttons={deleteButtons} onClick={this.deleteFeature} />);
            }
        }
        let busyDiv = null;
        if (this.state.busy) {
            busyDiv = (<div className="attrib-form-busy" />);
        }
        let childAttributeForm = null;
        if (this.state.childEdit) {
            childAttributeForm = (
                <div className="link-feature-form-container">
                    <LinkFeatureForm {...this.state.childEdit} finished={this.finishChildEdit} iface={this.props.iface} />
                </div>
            );
        }
        return (
            <div className="AttributeForm">
                {this.props.editContext.geomReadOnly ? (
                    <div className="attrib-form-geom-readonly">{LocaleUtils.tr("editing.geomreadonly")}</div>
                ) : null}
                <form action="" onSubmit={this.onSubmit}>
                    {this.props.editConfig.form ? (
                        <QtDesignerForm addRelationRecord={this.addRelationRecord} editLayerId={this.props.editConfig.editDataset} feature={this.props.editContext.feature}
                            featureChanged={this.props.editContext.changed} fields={this.fieldsMap(this.props.editConfig.fields)}
                            form={this.props.editConfig.form} iface={this.props.iface} loadRelationValues={this.loadRelationValues}
                            mapPrefix={this.editMapPrefix()} readOnly={readOnly} relationValues={this.props.editContext.feature.relationValues}
                            removeRelationRecord={this.removeRelationRecord} switchEditContext={this.startChildEdit}
                            updateField={this.updateField} updateRelationField={this.updateRelationField} />
                    ) : (
                        <AutoEditForm editLayerId={this.props.editConfig.editDataset} fields={this.props.editConfig.fields}
                            iface={this.props.iface}
                            readOnly={readOnly} touchFriendly={this.props.touchFriendly} updateField={this.updateField}
                            values={this.props.editContext.feature.properties} />
                    )}
                    {commitBar}
                </form>
                {deleteBar}
                {busyDiv}
                {childAttributeForm}
            </div>

        );
    }
    fieldsMap = (fields) => {
        return fields.reduce((res, field) => ({...res, [field.id]: field}), {});
    }
    updateField = (key, value) => {
        const newProperties = {...this.props.editContext.feature.properties, [key]: value};
        const newFeature = {...this.props.editContext.feature, properties: newProperties};
        this.props.setEditContext(this.props.editContext.id, {feature: newFeature, changed: true});
    }
    editMapPrefix = () => {
        return (this.props.editConfig.editDataset.match(/^[^.]+\./) || [""])[0];
    }
    loadRelationValues = (relationTables) => {
        const mapPrefix = this.editMapPrefix();
        const relTables = Object.entries(relationTables).map(([name, fk]) => mapPrefix + name + ":" + fk).join(",");
        const feature = this.props.editContext.feature;
        this.props.iface.getRelations(this.props.editConfig.editDataset, feature.id, relTables, (response => {
            const newFeature = {...feature, relationValues: response.relationvalues};
            this.props.setEditContext(this.props.editContext.id, {feature: newFeature});
        }));
    }
    addRelationRecord = (table) => {
        const newRelationValues = {...this.props.editContext.feature.relationValues};
        if (!newRelationValues[table]) {
            newRelationValues[table] = {
                fk: this.state.relationTables[table],
                features: []
            };
        }
        newRelationValues[table].features = newRelationValues[table].features.concat([{
            __status__: "new",
            type: "Feature",
            properties: {}
        }]);
        const newFeature = {...this.props.editContext.feature, relationValues: newRelationValues};
        this.props.setEditContext(this.props.editContext.id, {feature: newFeature, changed: true});
    }
    removeRelationRecord = (table, idx) => {
        const newRelationValues = {...this.props.editContext.feature.relationValues};
        newRelationValues[table] = {...newRelationValues[table]};
        newRelationValues[table].features = newRelationValues[table].features.slice(0);
        const fieldStatus = newRelationValues[table].features[idx].__status__ || "";
        // If field was new, delete it directly, else mark it as deleted
        if (fieldStatus === "new") {
            newRelationValues[table].features.splice(idx, 1);
        } else {
            newRelationValues[table].features[idx] = {
                ...newRelationValues[table].features[idx],
                __status__: fieldStatus.startsWith("deleted") ? fieldStatus.substr(8) : "deleted:" + fieldStatus
            };
        }
        const newFeature = {...this.props.editContext.feature, relationValues: newRelationValues};
        this.props.setEditContext(this.props.editContext.id, {feature: newFeature, changed: true});
    }
    updateRelationField = (table, idx, key, value) => {
        const newRelationValues = {...this.props.editContext.feature.relationValues};
        newRelationValues[table] = {...newRelationValues[table]};
        newRelationValues[table].features = newRelationValues[table].features.slice(0);
        newRelationValues[table].features[idx] = {
            ...newRelationValues[table].features[idx],
            properties: {
                ...newRelationValues[table].features[idx].properties,
                [key]: value
            },
            __status__: newRelationValues[table].features[idx].__status__ === "new" ? "new" : "changed"
        };
        const newFeature = {...this.props.editContext.feature, relationValues: newRelationValues};
        this.props.setEditContext(this.props.editContext.id, {feature: newFeature, changed: true});
    }
    onDiscard = (action) => {
        if (action === "Discard") {
            if (this.props.editContext.action === 'Pick') {
                // Re-query the original feature
                this.props.iface.getFeatureById(this.props.editConfig.editDataset, this.props.editContext.feature.id, this.props.map.projection, (feature) => {
                    this.props.setEditContext(this.props.editContext.id, {feature: feature, changed: false});
                });
            } else {
                this.props.setEditContext(this.props.editContext.id, {feature: null, changed: false});
            }
        }
    }
    onSubmit = (ev) => {
        ev.preventDefault();
        this.setState({busy: true});

        let feature = this.props.editContext.feature;
        // Ensure properties is not null
        feature = {
            ...feature,
            properties: feature.properties || {},
            crs: {
                type: "name",
                properties: {name: CoordinatesUtils.toOgcUrnCrs(this.props.map.projection)}
            }
        };

        const curConfig = this.props.editConfig;
        const mapPrefix = this.editMapPrefix();

        // Keep relation values separate
        const relationValues = clone(feature.relationValues || {});
        delete feature.relationValues;
        const relationUploads = {};
        const featureUploads = {};

        // Collect all values from form fields
        const fieldnames = Array.from(ev.target.elements).map(element => element.name).filter(x => x);
        fieldnames.forEach(name => {
            const fieldConfig = (curConfig.fields || []).find(field => field.id === name) || {};
            const element = ev.target.elements.namedItem(name);
            if (element) {
                let value = element.type === "radio" || element.type === "checkbox" ? element.checked : element.value;
                const nullElements = ["date", "number", "radio"];
                const nullFieldTypes = ["date", "number", "list"];
                if ((element instanceof RadioNodeList || nullElements.includes(element.type) || nullFieldTypes.includes(fieldConfig.type)) && element.value === "") {
                    // Set empty value to null instead of empty string
                    value = null;
                }
                const parts = name.split("__");
                if (parts.length >= 3) {
                    // Usually <table>__<field>__<index>, but <field> might also contain __ (i.e. upload__user)
                    const tablename = parts[0];
                    const datasetname = mapPrefix + tablename;
                    const field = parts.slice(1, parts.length - 1).join("__");
                    const index = parseInt(parts[parts.length - 1], 10);
                    // relationValues for table must exist as rows are either pre-existing or were added
                    relationValues[datasetname].features[index].properties[field] = value;
                    if (element.type === "file" && element.files.length > 0) {
                        relationUploads[name] = element.files[0];
                    } else if (element.type === "hidden" && element.value.startsWith("data:")) {
                        relationUploads[name] = new File([this.dataUriToBlob(element.value)], uuid.v1() + ".jpg", {type: "image/jpeg"});
                    }
                } else {
                    feature.properties[name] = value;
                    if (element.type === "file" && element.files.length > 0) {
                        featureUploads[name] = element.files[0];
                    } else if (element.type === "hidden" && element.value.startsWith("data:")) {
                        featureUploads[name] = new File([this.dataUriToBlob(element.value)], uuid.v1() + ".jpg", {type: "image/jpeg"});
                    }
                }
            }
        });
        const featureData = new FormData();
        featureData.set('feature', JSON.stringify(feature));
        Object.entries(featureUploads).forEach(([key, value]) => featureData.set('file:' + key, value));

        if (this.props.editContext.action === "Draw") {
            if (this.props.iface.addFeatureMultipart) {
                this.props.iface.addFeatureMultipart(this.props.editConfig.editDataset, featureData, (success, result) => this.featureCommited(success, result, relationValues, relationUploads));
            } else {
                this.props.iface.addFeature(this.props.editConfig.editDataset, feature, this.props.map.projection, (success, result) => this.featureCommited(success, result, relationValues, relationUploads));
            }
        } else if (this.props.editContext.action === "Pick") {
            if (this.props.iface.editFeatureMultipart) {
                this.props.iface.editFeatureMultipart(this.props.editConfig.editDataset, feature.id, featureData, (success, result) => this.featureCommited(success, result, relationValues, relationUploads));
            } else {
                this.props.iface.editFeature(this.props.editConfig.editDataset, feature, this.props.map.projection, (success, result) => this.featureCommited(success, result, relationValues, relationUploads));
            }
        }
    }
    featureCommited = (success, result, relationValues, relationUploads) => {
        if (!success) {
            this.commitFinished(success, result);
            return;
        }
        let newFeature = result;
        // Commit relations
        if (!isEmpty(relationValues)) {
            // Prefix relation tables and fields
            const mapPrefix = this.editMapPrefix();
            const relationData = new FormData();
            relationData.set('values', JSON.stringify(relationValues));
            Object.entries(relationUploads).forEach(([key, value]) => relationData.set(mapPrefix + key, value));

            this.props.iface.writeRelations(this.props.editConfig.editDataset, newFeature.id, relationData, (relResult, errorMsg) => {
                if (relResult === false) {
                    this.commitFinished(false, errorMsg);
                } else if (relResult.success !== true) {
                    // Relation values commit failed, switch to pick update relation values with response and switch to pick to
                    // to avoid adding feature again on next attempt
                    this.commitFinished(false, LocaleUtils.tr("editing.relationcommitfailed"));
                    newFeature = {...newFeature, relationValues: relResult.relationvalues};
                    this.props.setEditContext(this.props.editContext.id, {action: "Pick", feature: newFeature, changed: true});
                } else {
                    this.commitFinished(true, result);
                }
            });
        } else {
            this.commitFinished(success, result);
        }
    }
    deleteClicked = () => {
        this.setState({deleteClicked: true});
        this.props.setCurrentTaskBlocked(true);
    }
    deleteFeature = (action) => {
        if (action === 'Yes') {
            this.setState({busy: true});
            this.props.iface.deleteFeature(this.props.editConfig.editDataset, this.props.editContext.feature.id, this.deleteFinished);
        } else {
            this.setState({deleteClicked: false});
            this.props.setCurrentTaskBlocked(false);
        }
    }
    commitFinished = (success, result) => {
        this.setState({busy: false});
        if (success) {
            this.props.setEditContext(this.props.editContext.id, {action: 'Pick', feature: result, changed: false});
            this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
        } else {
            // eslint-disable-next-line
            alert(result);
        }
    }
    deleteFinished = (success, errorMsg) => {
        this.setState({busy: false});
        if (success) {
            this.setState({deleteClicked: false});
            this.props.setCurrentTaskBlocked(false);
            this.props.setEditContext(this.props.editContext.id, {feature: null, changed: false});
            this.props.refreshLayer(layer => layer.role === LayerRole.THEME);
        } else {
            // eslint-disable-next-line
            alert(errorMsg);
        }
    }
    dataUriToBlob = (dataUri) => {
        const parts = dataUri.split(',');
        const byteString = parts[0].indexOf('base64') >= 0 ? atob(parts[1]) : decodeURI(parts[1]);
        const mimeString = parts[0].split(':')[1].split(';')[0];

        const ia = new Uint8Array(byteString.length);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        return new Blob([ia], {type: mimeString});
    }
    startChildEdit = (editContextId, action, layer, featureId, updateField) => {
        const editConfig = (this.props.theme.editConfig || {})[layer];
        this.setState({childEdit: {action, editConfig, editContextId, featureId, updateField}});
    }
    finishChildEdit = (featureId) => {
        this.props.clearEditContext(this.state.childEdit.editContextId, this.props.editContext.id);
        if (featureId !== this.state.childEdit.featureId) {
            this.state.childEdit.updateField(featureId);
        }
        this.setState({childEdit: null});
    }
}

export default connect(state => ({
    map: state.map,
    theme: state.theme.current
}), {
    clearEditContext: clearEditContext,
    setEditContext: setEditContext,
    setCurrentTaskBlocked: setCurrentTaskBlocked,
    refreshLayer: refreshLayer
})(AttributeForm);
