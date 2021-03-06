// startタグ取得
$.fn.startTag = function () {
    return this[0].outerHTML.split(this.html())[0];
};
// endタグ取得
$.fn.endTag = function () {
    return this[0].outerHTML.split(this.html())[1];
};
// jsonデータからプロパティ値取得(nullは"")
// プロパティが存在しない時はdefaultValueを返す。
$.fn.getStringValue = function (data, propertyName, defaultValue) {
    const flattened = flattenObject(data);
    var value = (flattened.hasOwnProperty(propertyName)) ? flattened[propertyName] : defaultValue;
    if (value == null) {
        value = "";
    }

    return value;
};
// Form入力値取得
$.fn.getDataFromForm = function (formSelector) {
    var conditions = {};
    // 指定フォームの値を全て条件に追加
    $(formSelector).serializeArray().forEach(function (formData, index) {
        conditions[formData.name] = formData.value;
    });
    return conditions;
    // キャッシュ回避
    //conditions['dummy'] = new Date();
};
// Form表示
$.fn.setDataToForm = function (formSelector, conditions) {
    $(formSelector).serializeArray().forEach(function (formData, index) {
        var name = formData.name;
        var value = $.fn.getStringValue(conditions, name, "");
        $('input[name="' + name + '"], select[name="' + name + '"]', $(formSelector)).val(value);
    });
};
// Form表示
$.fn.clearFormValue = function (formSelector) {
    $(formSelector).find('input, select').val('');
}
var flattenObject = function (ob) {
    var toReturn = {};

    for (var i in ob) {
        if (!ob.hasOwnProperty(i)) continue;

        if ((typeof ob[i]) == 'object') {
            var flatObject = flattenObject(ob[i]);
            for (var x in flatObject) {
                if (!flatObject.hasOwnProperty(x)) continue;

                toReturn[i + '.' + x] = flatObject[x];
            }
        } else {
            toReturn[i] = ob[i];
        }
    }
    return toReturn;
};
// エラー削除
$.fn.clearFormError = function (formSelector) {
    $(formSelector).find('p.error.message').html('');
}
// 必要なカラムを確認
$.fn.checkRequired = function (formSelector) {
    var isError = false;
    $('font[color=red]:contains("＊")').each(function() {
        var formGroup = $(this).closest('.form-group');
        var fieldNameDisplay = $(formGroup).find('label.label-title').contents().filter(function() {
            return this.nodeType == Node.TEXT_NODE;
        }).text().trim();

        if (fieldName = $(formGroup).find('label.label-title').attr('for')) {
            var control = $(formGroup).find('[name='+ fieldName +']');
            if (control.val() === '') {
                $(formGroup).find('.error.message').text(fieldNameDisplay + 'が未入力です');
                isError = true;
            }
        }
    });
    return isError;
}