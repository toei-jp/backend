/**
 * 興行区分マスタコントローラー
 */
import * as chevre from '@chevre/api-nodejs-client';
import * as createDebug from 'debug';
import { Request, Response } from 'express';
import { NO_CONTENT } from 'http-status';
import * as _ from 'underscore';
import * as Message from '../common/Const/Message';

const debug = createDebug('chevre-backend:controllers');

const MAX_LENGTH = 64;

/**
 * 新規登録
 */
export async function add(req: Request, res: Response): Promise<void> {
    const serviceTypeService = new chevre.service.ServiceType({
        endpoint: <string>process.env.API_ENDPOINT,
        auth: req.user.authClient
    });
    let message = '';
    let errors: any = {};
    if (req.method === 'POST') {
        // 検証
        validateForm(req);
        const validatorResult = await req.getValidationResult();
        errors = req.validationErrors(true);
        // 検証
        if (validatorResult.isEmpty()) {
            // 興行区分DB登録プロセス
            try {
                const serviceType = createFromBody(req.body);
                const { totalCount } = await serviceTypeService.search({ ids: [serviceType.id] });
                if (totalCount > 0) {
                    throw new Error('既に存在する興行区分コードです');
                }

                await serviceTypeService.create(serviceType);
                req.flash('message', '作成しました');
                res.redirect('/boxOfficeTypes');

                return;
            } catch (error) {
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
}
/**
 * 一覧データ取得API
 */
export async function getList(req: Request, res: Response): Promise<void> {
    try {
        const serviceTypeService = new chevre.service.ServiceType({
            endpoint: <string>process.env.API_ENDPOINT,
            auth: req.user.authClient
        });

        const result = await serviceTypeService.search({
            ids: [req.query.id],
            name: req.query.name,
            ...{ // 型が未対応なので
                sort: { _id: chevre.factory.sortType.Ascending }
            }
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
    } catch (err) {
        res.json({
            success: false,
            count: 0,
            results: []
        });
    }
}
/**
 * 一覧
 */
export async function index(__: Request, res: Response): Promise<void> {
    // 興行区分マスタ画面遷移
    res.render('boxOfficeType/index', {
        message: ''
    });
}

/**
 * 編集
 */
export async function update(req: Request, res: Response): Promise<void> {
    const serviceTypeService = new chevre.service.ServiceType({
        endpoint: <string>process.env.API_ENDPOINT,
        auth: req.user.authClient
    });
    // 検証
    validateForm(req, false);
    const validatorResult = await req.getValidationResult();
    const validations = req.validationErrors(true);
    if (!validatorResult.isEmpty()) {
        res.json({
            validation: validations,
            error: null
        });

        return;
    }

    try {
        const serviceType = createFromBody({ ...req.body, id: req.params.id });
        await serviceTypeService.update(serviceType);
        res.status(NO_CONTENT).end();
    } catch (err) {
        debug('update error', err);
        res.json({
            validation: null,
            error: err.message
        });
    }
}

function createFromBody(body: any): chevre.factory.serviceType.IServiceType {
    return {
        typeOf: <'ServiceType'>'ServiceType',
        id: <string>body.id,
        name: <string>body.name
    };
}

/**
 * 興行区分マスタ新規登録画面検証
 */
function validateForm(req: Request, idAdd: boolean = true): void {
    let colName: string = '';
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
