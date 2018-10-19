"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 興行区分マスタコントローラー
 */
const chevre = require("@toei-jp/chevre-api-nodejs-client");
const createDebug = require("debug");
const http_status_1 = require("http-status");
const _ = require("underscore");
const Message = require("../common/Const/Message");
const debug = createDebug('chevre-backend:controllers');
const MAX_LENGTH = 64;
/**
 * 新規登録
 */
function add(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const boxOfficeTypeService = new chevre.service.BoxOfficeType({
            endpoint: process.env.API_ENDPOINT,
            auth: req.user.authClient
        });
        let message = '';
        let errors = {};
        if (req.method === 'POST') {
            // 検証
            validateForm(req);
            const validatorResult = yield req.getValidationResult();
            errors = req.validationErrors(true);
            // 検証
            if (validatorResult.isEmpty()) {
                // 興行区分DB登録プロセス
                try {
                    const boxOfficeType = {
                        id: req.body.id,
                        name: req.body.name
                    };
                    yield boxOfficeTypeService.createBoxOfficeType(boxOfficeType);
                    res.redirect('/complete');
                    return;
                }
                catch (error) {
                    message = error.message;
                }
            }
        }
        const forms = {
            id: (_.isEmpty(req.body.id)) ? '' : req.body.id,
            name: (_.isEmpty(req.body.name)) ? '' : req.body.name
        };
        res.render('boxOfficeType/add', {
            message: message,
            errors: errors,
            forms: forms
        });
    });
}
exports.add = add;
/**
 * 一覧データ取得API
 */
function getList(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const boxOfficeTypeService = new chevre.service.BoxOfficeType({
                endpoint: process.env.API_ENDPOINT,
                auth: req.user.authClient
            });
            const result = yield boxOfficeTypeService.searchBoxOfficeType({
                id: req.query.id,
                name: req.query.name
            });
            res.json({
                success: true,
                count: result.totalCount,
                results: result.data.map((t) => {
                    return {
                        id: t.id,
                        name: t.name
                    };
                })
            });
        }
        catch (err) {
            res.json({
                success: false,
                count: 0,
                results: []
            });
        }
    });
}
exports.getList = getList;
/**
 * 一覧
 */
function index(__, res) {
    return __awaiter(this, void 0, void 0, function* () {
        // 興行区分マスタ画面遷移
        res.render('boxOfficeType/index', {
            message: ''
        });
    });
}
exports.index = index;
/**
 * 編集
 */
function update(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const boxOfficeTypeService = new chevre.service.BoxOfficeType({
            endpoint: process.env.API_ENDPOINT,
            auth: req.user.authClient
        });
        // 検証
        validateForm(req, false);
        const validatorResult = yield req.getValidationResult();
        const validations = req.validationErrors(true);
        if (!validatorResult.isEmpty()) {
            res.json({
                validation: validations,
                error: null
            });
            return;
        }
        // 興行区分DB更新プロセス
        try {
            const boxOfficeType = {
                id: req.params.id,
                name: req.body.name
            };
            yield boxOfficeTypeService.updateBoxOfficeType(boxOfficeType);
            res.status(http_status_1.NO_CONTENT).end();
        }
        catch (err) {
            debug('update error', err);
            res.json({
                validation: null,
                error: err.message
            });
        }
    });
}
exports.update = update;
/**
 * 興行区分マスタ新規登録画面検証
 */
function validateForm(req, idAdd = true) {
    let colName = '';
    if (idAdd) {
        colName = '興行区分コード';
        req.checkBody('id', Message.Common.required.replace('$fieldName$', colName)).notEmpty();
        req.checkBody('id', Message.Common.getMaxLengthHalfByte(colName, MAX_LENGTH))
            .isAlphanumeric().len({ max: MAX_LENGTH });
    }
    colName = '名称';
    req.checkBody('name', Message.Common.required.replace('$fieldName$', colName)).notEmpty();
    req.checkBody('name', Message.Common.getMaxLength(colName, MAX_LENGTH)).len({ max: MAX_LENGTH });
}
