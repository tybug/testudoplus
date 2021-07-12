// ==UserScript==
// @name        Terp Course Helper
// @author      DickyT / tybug
// @license     WTFPL
// @encoding    utf-8
// @date        04/12/2019
// @modified    05/01/2021
// @include     https://app.testudo.umd.edu/soc/*
// @grant       GM_xmlhttpRequest
// @run-at      document-end
// @version     0.1.1
// @description Integrate Rate My Professor to Testudo Schedule of Classes
// @namespace   dkt.umdrmp.testudo
// ==/UserScript==

const DATA = {
  rmp: {},
  pt: {},
};
let ALIAS = {};

// add sorting button
const sortBtn = document.createElement('button');
sortBtn.addEventListener('click', sortAllByGPA);
sortBtn.disabled = true;
sortBtn.textContent = 'Sort By Average GPA Descending (Loading data, please wait)';
document.querySelector('#content-wrapper > div').insertBefore(sortBtn, document.querySelector('#courses-page'));

// add reset button
const resetBtn = document.createElement('button');
resetBtn.style.cssText = "margin-left: 20px;"
resetBtn.addEventListener('click', resetSort);
resetBtn.textContent = 'Reset Sort';
document.querySelector('#content-wrapper > div').insertBefore(resetBtn, document.querySelector('#courses-page'));

function loadAliasTable() {
  return new Promise((resolve) => {
    const url = 'https://raw.githubusercontent.com/tybug/Terp-Course-Helper/master/alias.json';
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      onload: (data) => {
        if (data.status == 200) {
          ALIAS = JSON.parse(data.responseText);
        }
        resolve();
      }
    });
  });
}

function getInstructorName(elem) {
  const container = elem.childNodes[0];
  if (container instanceof HTMLAnchorElement) {
    return container.innerText;
  }
  return container.wholeText;
}

function updateInstructorRating() {
  // unsafeWindow.console.log(DATA.rmp);
  const instructorElements = unsafeWindow.document.querySelectorAll('.section-instructor');
  Array.prototype.map.call(instructorElements, (elem) => {
    const instructorName = getInstructorName(elem);
    if (DATA.rmp[instructorName]) {
      const oldElem = elem.querySelector('.rmp-rating-box');
      if (oldElem) {
        oldElem.remove();
      }
      const rating = DATA.rmp[instructorName].rating;
      const ratingElem = document.createElement('a');
      ratingElem.className = 'rmp-rating-box';
      ratingElem.href = rating ? `https://www.ratemyprofessors.com/ShowRatings.jsp?tid=${DATA.rmp[instructorName].recordId}` : '';
      ratingElem.title = instructorName;
      ratingElem.target = '_blank';
      ratingElem.innerText = rating ? rating.toFixed(1) : 'N/A';
      elem.appendChild(ratingElem);
    }
  });

  updatePTData();
}

function getRecordId(name) {
  return new Promise((resolve, reject) => {
    // unsafeWindow.console.log(ALIAS, name);
    if (ALIAS[name]) {
      const recordId = ALIAS[name].rmpId;
      if (recordId) {
        return resolve(recordId);
      }
    }
    const url = `https://search-production.ratemyprofessors.com/solr/rmp/select?q=${encodeURIComponent(name)}&defType=edismax&qf=teacherfullname_t%5E1000%20autosuggest&bf=pow%28total_number_of_ratings_i%2C2.1%29&siteName=rmp&rows=20&start=0&fl=pk_id%20teacherfirstname_t%20teacherlastname_t%20total_number_of_ratings_i%20schoolname_s%20averageratingscore_rf%20averageclarityscore_rf%20averagehelpfulscore_rf%20averageeasyscore_rf%20chili_i%20schoolid_s%20teacherdepartment_s&fq=schoolid_s%3A1270&wt=json`;
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      onload: (data) => {
        if (data.status == 200) {
          const res = JSON.parse(data.responseText);

          const suggestionList = res.response.docs;
          const [instructorInfo] = suggestionList.filter(d => d.schoolid_s === '1270');
          if (instructorInfo) {
            // unsafeWindow.console.log(instructorInfo);
            return resolve(instructorInfo.pk_id);
          }
        }
        reject();
      }
    });
  });
}

function getRating(recordId) {
  return new Promise((resolve, reject) => {
    const url = `https://www.ratemyprofessors.com/ShowRatings.jsp?tid=${recordId}`;
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      onload: (data) => {
        if (data.status == 200) {
          const res = data.responseText;
          const reader = document.implementation.createHTMLDocument('reader'); // prevent loading any resources
          const fakeHtml = reader.createElement('html');
          fakeHtml.innerHTML = res;
          const ratingRawElem = fakeHtml.querySelector('[class^="RatingValue__Numerator"]');
          if (ratingRawElem) {
            return resolve(Number(ratingRawElem.innerText));
          }
        }
        reject();
      }
    });
  });
}

function loadRateData() {
  const instructorElements = unsafeWindow.document.querySelectorAll('.section-instructor');
  Array.prototype.map.call(instructorElements, (elem) => {
    const instructorName = getInstructorName(elem);
    if (!DATA.rmp[instructorName]) {
      DATA.rmp[instructorName] = {
        name: instructorName,
      };
      getRecordId(instructorName).then((recordId) => {
        getRating(recordId).then((rating) => {
          DATA.rmp[instructorName].recordId = recordId;
          DATA.rmp[instructorName].rating = rating;

          updateInstructorRating();
        }).catch(() => {
          updateInstructorRating();
        });
      }).catch(() => {
        updateInstructorRating();
      });
    }
  });
}

function getPTCourseData(courseId) {
  return new Promise((resolve, reject) => {
    const url = `https://planetterp.com/course/${courseId}`;
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      onload: (data) => {
        if (data.status == 200) {
          const res = data.responseText;
          const reader = document.implementation.createHTMLDocument('reader'); // prevent loading any resources
          const fakeHtml = reader.createElement('html');
          fakeHtml.innerHTML = res;

          const courseData = {
            courseId,
            instructors: {},
          };

          const avgGPAElem = fakeHtml.querySelector('#course-grades > p.text-center');
          if (avgGPAElem) {
            const matchRes = avgGPAElem.innerText.match(/Average GPA: ([0-9]\.[0-9]{2})/);
            if (matchRes && matchRes[1]) {
              const avgGPA = Number(matchRes[1]);
              if (!Number.isNaN(avgGPA)) {
                courseData.avgGPA = avgGPA;
              }
            }
          }

          const instructorReviewElementList = fakeHtml.querySelectorAll('#course-professors > div');
          Array.prototype.map.call(instructorReviewElementList, (instructorCardElem) => {
            const instructorNameElem = instructorCardElem.querySelector('.card-header a');
            if (instructorNameElem) {
              const instructorName = instructorNameElem.innerText;
              const instructorId = instructorNameElem.getAttribute('href').replace(/^\/professor\//, '');

              const reviewElement = instructorCardElem.querySelector('.card-text');
              if (reviewElement) {
                const res = reviewElement.innerText.match(/Average rating: ([0-9]\.[0-9]{2})/);
                if (res && res[1]) {
                  const rating = Number(res[1]);
                  if (!Number.isNaN(rating)) {
                    courseData.instructors[instructorName] = {
                      name: instructorName,
                      id: instructorId,
                      rating,
                    }
                  }
                }
              }
            }
          });

          return resolve(courseData);
        }
        reject();
      }
    });
  });
}

function updatePTData() {
  const allCourseElem = document.querySelectorAll('#courses-page .course');
  Array.prototype.map.call(allCourseElem, (courseElem) => {
    const courseIdElem = courseElem.querySelector('.course-id');
    const courseId = courseIdElem.innerText;
    const courseIdContainer = courseIdElem.parentNode;

    const oldElem = courseElem.querySelector('.pt-gpa-box');
    if (oldElem) {
      oldElem.remove();
    }

    if (DATA.pt[courseId]) {
      const avgGPA = DATA.pt[courseId].avgGPA;

      const avgGPAElem = document.createElement('a');
      avgGPAElem.className = 'pt-gpa-box';
      avgGPAElem.href = `https://planetterp.com/course/${courseId}`;
      avgGPAElem.title = courseId;
      avgGPAElem.target = '_blank';
      avgGPAElem.innerText = avgGPA ? `AVG GPA ${avgGPA.toFixed(2)}` : 'N/A';

      const shareCourseElem = courseIdContainer.querySelector('.share-course-div');
      if (shareCourseElem) {
        shareCourseElem.before(avgGPAElem);
      } else {
        courseIdContainer.appendChild(avgGPAElem);
      }
    }

    const instructorElemList = courseElem.querySelectorAll('.section-instructor');

    Array.prototype.map.call(instructorElemList, (elem) => {
      const instructorName = getInstructorName(elem);
      if (DATA.pt && DATA.pt[courseId] && DATA.pt[courseId].instructors && DATA.pt[courseId].instructors[instructorName]) {
        const oldElem = elem.querySelector('.pt-rating-box');
        if (oldElem) {
          oldElem.remove();
        }

        const rating = DATA.pt[courseId].instructors[instructorName].rating;
        const ratingElem = document.createElement('a');
        ratingElem.className = 'pt-rating-box';
        ratingElem.href = rating ? `https://planetterp.com/professor/${DATA.pt[courseId].instructors[instructorName].id}` : '';
        ratingElem.title = instructorName;
        ratingElem.target = '_blank';
        ratingElem.innerText = rating ? rating.toFixed(2) : 'N/A';
        elem.appendChild(ratingElem);
      }
    });
  });
}

function loadPTData() {
  const courseIdElements = document.querySelectorAll('.course-id');

  let count = 0;

  function tryUpdateUI() {
    count += 1;

    sortBtn.textContent = `Sort By Average GPA Descending (Loading ${count}/${courseIdElements.length})`;

    if (count >= courseIdElements.length) {
      updatePTData();
    }

    if (count === courseIdElements.length) {
      console.log('LOAD DONE');
      sortBtn.textContent = 'Sort By Average GPA Descending';
      sortBtn.disabled = false;
    }
  }

  Array.prototype.map.call(courseIdElements, (elem) => {
    const courseId = elem.innerText;
    if (!DATA.pt[courseId]) {
      DATA.pt[courseId] = {
        courseId,
      };
      getPTCourseData(courseId).then((courseData) => {
        DATA.pt[courseId] = courseData;
        tryUpdateUI();
      }).catch(() => {
        tryUpdateUI();
      });
    }
  });
}

function createShareLinks() {
  const courseElements = unsafeWindow.document.querySelectorAll('.course');
  const baseURL = "https://app.testudo.umd.edu/soc";
  const copyLink = courseId => {
    const copyfield = document.createElement('textarea');
    const currentURL = window.location.href;
    var termId;
    if (currentURL.includes("termId=")) {
      termId = currentURL.split("termId=")[1].split("&")[0];
    } else {
      termId = currentURL.split("/soc/")[1].split("/")[0];
    }
    let toCopy = baseURL + "/" + termId + "/" + courseId.substring(0, 4) + "/" + courseId;
    copyfield.value = toCopy;
    document.body.appendChild(copyfield);
    copyfield.select();
    document.execCommand('copy');
    document.body.removeChild(copyfield);
  };
  Array.prototype.map.call(courseElements, (elem) => {
    const shareDiv = document.createElement('div');
    shareDiv.className = 'share-course-div';
    const shareLink = document.createElement('text');
    shareLink.className = 'share-course-link';
    shareLink.innerText = "Share";
    shareLink.setAttribute("data-tooltip", "copy to clipboard");
    shareDiv.appendChild(shareLink);
    shareDiv.addEventListener('click', function(e) {
      copyLink(elem.id);
    });
    elem.querySelector('.course-id-container').appendChild(shareDiv);
  });
}

// unsafeWindow.window.x = updatePTData;

function main() {
  loadAliasTable().then(() => {
    // First load
    loadPTData();
    loadRateData();
  });
}

function sortAllByGPA() {
  const coursesContainer = document.querySelector('.courses-container');
  const allCourses = [...document.querySelectorAll('div.course')];

  allCourses.sort((courseElem, otherCourseElem) => {
    if (!DATA.pt[courseElem.id] || !DATA.pt[courseElem.id].avgGPA) {
      return 100;
    }
    if (!DATA.pt[otherCourseElem.id] || !DATA.pt[otherCourseElem.id].avgGPA) {
      return -100;
    }
    return DATA.pt[otherCourseElem.id].avgGPA - DATA.pt[courseElem.id].avgGPA;
  });

  allCourses.forEach((courseElem) => {
    coursesContainer.append(courseElem);
  });

  const headerList = document.querySelectorAll('.course-prefix-container');

  if (headerList.length > 1) {
    headerList.forEach(e => e.remove());
  }
}

function resetSort() {
  const coursesContainer = document.querySelector('.courses-container');
  const allCourses = [...document.querySelectorAll('div.course')];

  allCourses.sort((course1, course2) => {
    return course1.id.toLowerCase().localeCompare(course2.id.toLowerCase());
  });

  allCourses.forEach((courseElem) => {
    coursesContainer.append(courseElem);
  });

  const headerList = document.querySelectorAll('.course-prefix-container');

  if (headerList.length > 1) {
    headerList.forEach(e => e.remove());
  }
}

const styleInject = `
.rmp-rating-box,
.pt-rating-box {
  border-radius: 5px;
  padding: 1px 5px;
  margin-left: 10px;
  background-color: #FF0266;
  color: #FFFFFF !important;
  font-family: monospace;
}
.pt-rating-box {
  background-color: #009688;
}
.pt-gpa-box {
  display: flex;
  justify-content: center;
  text-align: center;
  margin-top: 10px;
  border-radius: 5px;
  background-color: #009688;
  color: #FFFFFF !important;
  font-family: monospace;
  padding: 1px;
}
.share-course-div {
  display: flex;
  justify-content: center;
  border-radius: 5px;
  padding: 1px;
  margin-top: 10px;
  background-color: #8E1515;
  color: #FFFFFF !important;
  font-family: monospace;
  cursor: pointer;
}

/* fancy tooltip stolen from https://stackoverflow.com/a/25813336, god bless him */
[data-tooltip]:before {
  /* needed - do not touch */
  content: attr(data-tooltip);
  position: absolute;
  opacity: 0;

  /* customizable */
  transition: all 0.15s ease;
  padding: 3px;
  color: white;
  border-radius: 5px;
  width: 150px;
  z-index: 10;
}

[data-tooltip]:hover:before {
  /* needed - do not touch */
  opacity: 1;

  /* customizable */
  background: black;
  margin-top: -30px;
  margin-left: -10px;
}

[data-tooltip]:not([data-tooltip-persistent]):before {
  pointer-events: none;
}
`;
const styleInjectElem = document.createElement('style');
styleInjectElem.id = 'umd-rmp-style-inject';
styleInjectElem.innerHTML = styleInject;
document.head.appendChild(styleInjectElem);

// Get rid of the crazy amount of unused parameters in SOC urls. I couldn't find a way to get rid of courseStartCompare,
// courseStartMin, and courseStartAM, even though they're all empty values.
// This will throw away any filters except courseId and termId, but almost nobody filters by anything else anyway. Can support more parameters
// if neceesary (likely by checking if the parameter value is equal to its default, discarding it if so, and keeping it otherwise).
const url = window.location.href;
var courseId = url.split("courseId=")[1].split("&")[0];
var termId = url.split("termId=")[1].split("&")[0];

const newUrl = `https://app.testudo.umd.edu/soc/search?courseId=${courseId}&termId=${termId}&courseStartCompare=&courseStartMin=&courseStartAM=`;

window.history.pushState("", "", newUrl);

main();
