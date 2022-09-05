import {calculateVolume, calculatePressure, minimalPressure} from "../lib/erp_gasCylinders";
import dayjs from "dayjs";
import _isEmpty from "lodash/isEmpty";
import _round from "lodash/round";


let referenceVolume = 0;


const Erp_GasCylinderChecks_MobileEdit = (form, core) => {
    return ({
        OnShow: () => {
            restoreContext(form,core);          
            setButtonVisibility(form);
        },
        btnSaveOnClick: async ()=> {
            saveContext(form,core);
            await insGasCylinderCheck(form, core);
            setButtonVisibility(form);
        },
        btnCloseOnClick:()=> {
            form.close(true);
        },
        GasCylinderIDOnValueChanged: async () => {
            setButtonVisibility(form);
            await setGasCylinderInfo(form,core);
        },
        FirmIDOnValueChanged: async () => {
            setButtonVisibility(form);
        },   
        TemperatureOnValueChanged: () => {
            changeVolume(form);
        },
        PressureOnValueChanged: (field) => {
            
            if(field.value < minimalPressure) {
                field.value = minimalPressure;
            }
            
            changeVolume(form);
            
        },
        QRCodeOnValueChanged: async () => {
            await searchGasCylinder(form, core);
            setButtonVisibility(form);
        }    
    });
};

function setButtonVisibility(form){
    let gasCylinder = form.field("GasCylinderID").value;
    let firm = form.field("FirmID").value;
    form.field("GasCylinderID").filter = {"FirmID": firm,"IsArchive": 0};
    form.field("NomenclatureID").filter = {"FirmID": firm, "IsGaseous": 1};
    if(!_isEmpty(gasCylinder)||(gasCylinder)){
        form.field("Pressure").isVisible = 1;
        form.field("Volume").isVisible = 1;
        form.button("btnSave").isVisible = 1;
    } else {
        form.field("Pressure").isVisible = 0;
        form.field("Volume").isVisible = 0;
        form.button("btnSave").isVisible = 0;
    }
}


async function searchGasCylinder(form, core) {

    let filter = {};
    let firm = form.field("FirmID").value;

    if (!firm) {
        core.showWarning("Не заповнена фірма!");
        form.field("GasCylinderID").value = null;
        return;
    }

    filter = {
        "Number": { "=": form.field("QRCode").value },
        "FirmID": firm,
        "IsArchive": 0
    };

    // ищем баллон
    let gasCylinderInfo = await core.loadObjectCollection("Erp_GasCylinders", {
        "Filters": filter,
        "Columns": ["ID"],
        "Sorts": ["Name"],
        "Page": 1,
    });
    let rsp = Number(gasCylinderInfo["ResponseCode"]);
    if (rsp > 400) {
        throw new JSWapiException("Помилка отримання даних по газових балонах!");
    }

    if (_isEmpty(gasCylinderInfo)) { // если не найдено все чистим
        form.field("GasCylinderID").value = null;
        await core.showWarning("Газовий балон не знайдено.");
    } else {
        form.field("GasCylinderID").value = gasCylinderInfo[0]["ID"];
        await setGasCylinderInfo(form, core);
    }

}


async function insGasCylinderCheck(form,core){

    let insRequest = [];

    let firm = form.field("FirmID").value;
    let gasCylinder = form.field("GasCylinderID").value;
    let nomenclatureID = form.field("NomenclatureID").value;
    let date = form.field("Date").value;

    if (!firm){
        await core.showWarning("Не можливо зберегти контроль, якщо не заповнена фірма.");
        return;
    }
    if (!gasCylinder){
        await core.showWarning("Не можливо зберегти контроль, якщо не заповнений газовий балон.");
        return;
    }
    if (!nomenclatureID){
        await core.showWarning("Не можливо зберегти контроль, якщо не заповнена номенклатура газу.");
        return;
    }
    if (!date){
        await core.showWarning("Не можливо зберегти контроль, якщо не заповнена дата контролю.");
        return;
    }
    //проверим на дату
    let gasCylinderCheckInfo = await core.loadObjectCollection("Erp_GasCylinderChecks", {
        "Filters": {"FirmID": firm, "GasCylinderID":gasCylinder, "Date":date},
        "Columns": ["Date"],
        "Sorts": ["-Date"],
        "Page": 1,
    });

    //console.log("gasCylinderCheckInfo",gasCylinderCheckInfo);
   
    if (!_isEmpty(gasCylinderCheckInfo)){
        await core.showWarning("На обрану дату контроль вже проведено.");
    } else {

        insRequest.push({
            "Date": date,
            "GasCylinderID": gasCylinder,
            "NomenclatureID": nomenclatureID,
            "Pressure": form.field("Pressure").value,
            "Temperature": form.field("Temperature").value,
            "Volume": form.field("Volume").value,
            "FirmID": firm
        });


        let insResult = await core.execObjectOperation("Erp_GasCylinderChecks", "Ins",
            {
                "Request": { "Erp_GasCylinderChecks": insRequest }
            },

        );

        
        if (!_isEmpty(insResult)) {
            let result = Number(insResult["ResponseCode"]);
            let message = insResult["ResponseText"];
            if (result > 400) {
                core.showError(message);
            } else {
                await core.showSuccess("Контроль кількості газу в балонах проведено.");
            }
        } else {
            await core.showSuccess("Контроль кількості газу в балонах проведено.");
        }
        form.field("GasCylinderID").value = null;
        form.field("QRCode").value = "";
        form.field("NomenclatureID").value = null;
        form.field("Pressure").value = 0;
        form.field("Volume").value = 0;
    }    

}

async function setGasCylinderInfo(form,core){
    let gasCylinder = form.field("GasCylinderID").value;
    if (!_isEmpty(gasCylinder) || (gasCylinder)) {
        let gasCylinderInfo = await core.loadObjectCollection("Erp_GasCylinders",
            {
                "Filters": { "ID": gasCylinder },
                "Columns": ["ID", "LastVolume", "ReferenceVolume", "LastNomenclatureID"]
            }
        );

        //console.log("gasCylinderInfo",gasCylinderInfo);
        if (!_isEmpty(gasCylinderInfo)) {
            form.field("NomenclatureID").value = gasCylinderInfo[0].LastNomenclatureID;
            form.field("Volume").value = gasCylinderInfo[0].LastVolume;
            referenceVolume = gasCylinderInfo[0].ReferenceVolume;
            changePressure(form);
        } else {
            form.field("Volume").value = 0;
            referenceVolume = 0;
        }
    }
}


function restoreContext(form,core){
    form.field("FirmID").value = getStored(core,form.name+"FirmID");
    form.field("Temperature").value = getStored(core,form.name+"Temperature");
    form.field("Date").value = dayjs().format("YYYY-MM-DD");
    
}    

function saveContext(form,core){
    
    setStored(core, form.name+"FirmID", form.field("FirmID").value);
    setStored(core, form.name+"Temperature", form.field("Temperature").value);
   
}

function getStored(core, key) {
    return core.userLocalStorage.getStorageItem(key);
}

function setStored(core, key, value) {
    core.userLocalStorage.removeStorageItem(key);
    core.userLocalStorage.setStorageItem(key, value);
}

function changePressure(form) {
    let currentVolume = form.field("Volume").value;
    let currentTemperature = form.field("Temperature").value;

    if(isNaN(currentVolume) || isNaN(currentTemperature)){
        return undefined;
    }

    let currentPressure  = calculatePressure(referenceVolume, currentVolume, currentTemperature);
    form.field("Pressure").value = _round(currentPressure, 2)||0;
}

function changeVolume(form) {
    let currentPressure = form.field("Pressure").value;
    let currentTemperature = form.field("Temperature").value;

    if(isNaN(currentPressure) || isNaN(currentTemperature)){
        return undefined;
    }

    let currentVolume  = calculateVolume(referenceVolume, currentPressure, currentTemperature);

    form.field("Volume").value = _round(currentVolume, 6);
}



window.userScript = {
    ...window.userScript,
    Erp_GasCylinderChecks_MobileEdit
};
