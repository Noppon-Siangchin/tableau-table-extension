# SuperTables — สรุป Features สำคัญ

> Version: 6.1.0 | Extension สำหรับ Tableau

---

## 1. การจัดการคอลัมน์ (Column Management)

- **Drag & Drop** — ลากคอลัมน์เพื่อจัดลำดับใหม่ได้
- **Show/Hide Columns** — เลือกแสดงหรือซ่อนคอลัมน์ผ่าน Columns Panel ด้านขวา
- **Autosize All Columns** — ปรับขนาดคอลัมน์อัตโนมัติตามเนื้อหา
- **Fit Columns to Window** — ปรับให้คอลัมน์พอดีกับหน้าต่าง
- **Autosize This Column** — ปรับขนาดเฉพาะคอลัมน์ที่เลือก
- **Pin Column** — ตรึงคอลัมน์ให้อยู่กับที่เมื่อ scroll

---

## 2. การกรองข้อมูล (Filtering)

### Inline Filter
- มี **filter icon (▽)** ที่ header ของทุกคอลัมน์
- สามารถ filter แต่ละคอลัมน์ได้อิสระจากกัน

### Filter Popup
- **Filter Condition** — dropdown เลือกเงื่อนไข เช่น `Equals`, `Contains`, `Greater Than`, `Less Than` ฯลฯ (ขึ้นอยู่กับชนิดข้อมูล)
- **Filter Input Box** — พิมพ์ค่าที่ต้องการกรอง
- **Reset** — คืนค่า filter กลับสู่ค่าเริ่มต้น
- **Clear** — ล้าง filter ทั้งหมด

### Filters Panel
- Filters Panel แยกต่างหากด้านขวาของตาราง

---

## 3. การเรียงข้อมูล (Sorting)

- **Sort Ascending** — เรียงจากน้อยไปมาก
- **Sort Descending** — เรียงจากมากไปน้อย
- **Set a default sorting order** — กำหนดค่า default ได้ว่าจะเป็น Ascending หรือ Descending

---

## 4. Row Groups & Pivot

- **Row Groups** — ลาก field มาวางที่ Row Groups เพื่อ group ข้อมูล
- **Pivot Mode** — เปิด/ปิดโหมด Pivot ได้จาก toggle ด้านขวา
- **Expand All** — ขยายทุก group พร้อมกัน
- **Expand All (-1)** — ขยาย group ยกเว้นระดับสุดท้าย
- **Close All** — ยุบทุก group

---

## 5. Values & Aggregation

- กำหนด **aggregate function** ได้ เช่น `Sum(Profit)`, `Sum(Quantity)`
- **Show aggregated value when grouping** — แสดงค่า aggregate เมื่อมีการ group
- **User can change aggregation method while grouping** — ให้ผู้ใช้เปลี่ยน aggregation method ได้เอง
- **Hide grand total** — ซ่อนผลรวมทั้งหมด

---

## 6. Number Format (ตั้งค่าต่อคอลัมน์)

| ตัวเลือก | รายละเอียด |
|---|---|
| Measure Style | เช่น Decimal, Percentage, Currency |
| Quick Table Calculation | คำนวณพิเศษ เช่น Running Total, % of Total |
| Positive / Negative Values | กำหนดรูปแบบการแสดงตัวเลขบวก/ลบ |
| Decimal Places | จำนวนทศนิยม |
| Prefix / Suffix | เพิ่มข้อความหน้า/หลังตัวเลข |
| Replace Null Values | กำหนดค่าแสดงแทน Null |
| Thousands (K) / Millions (M) / Billions (B) / Trillions (T) | ย่อหน่วยตัวเลข |
| Include Thousands Separator | ใส่จุลภาคคั่นหลักพัน |

---

## 7. Conditional Color Formatting

### Color Style
- **Color cell background** — ระบายสีพื้นหลัง cell
- **Color cell text** — เปลี่ยนสีตัวอักษร

### Background Color Options
- **Use color as background of entire row** — ระบายสีทั้งแถวแทนเฉพาะ cell

### Target Column
- เลือกคอลัมน์ที่ใช้เป็นเงื่อนไข เช่น `(Profit)`

### Color Zones
| Zone | ความหมาย |
|---|---|
| Below-bounds color | สีเมื่อค่าต่ำกว่า Lower bound |
| In-bounds color | สีเมื่อค่าอยู่ในช่วงปกติ |
| Above-bounds color | สีเมื่อค่าสูงกว่า Upper bound |

### Additional Options
- **Lower bound / Upper bound** — กำหนดขอบเขตตัวเลข
- **Use a gradient from upper to lower bound** — แสดงสีแบบ gradient ไล่เฉดระหว่างสองขอบ
- **Use custom font color** — กำหนดสีตัวหนังสือเพิ่มเติม
- **Show background as bar chart** — แสดงพื้นหลังเป็น data bar ในแต่ละ cell (คล้าย Excel)

---

## 8. Column Properties (ต่อคอลัมน์)

- **Column display name** — เปลี่ยนชื่อคอลัมน์ที่แสดง
- **Hide column in sidebar** — ซ่อนคอลัมน์จาก Columns Panel
- **Hide header name** — ซ่อนชื่อ header
- **Hide inline filter** — ซ่อน filter icon ในคอลัมน์นั้น
- **Hide grand total** — ซ่อนผลรวมของคอลัมน์

---

## 9. Calculations

- **Make a calculation** — สร้าง calculated field ใหม่ได้ภายใน extension
- มี search bar สำหรับค้นหา calculation ที่มีอยู่

---

## 10. Sparklines

- เพิ่ม mini chart ภายใน cell เพื่อแสดง trend ของข้อมูล

---

## 11. Combined Columns

- รวมหลายคอลัมน์เข้าด้วยกันเป็นคอลัมน์เดียว

---

## 12. Column Groups

- จัดกลุ่มคอลัมน์หลายคอลัมน์ภายใต้ header กลุ่มเดียว

---

## 13. Search

- ช่อง **Search** ใน panel ด้านขวาสำหรับค้นหา field อย่างรวดเร็ว

---

## 14. Formulas

- สร้างสูตรคำนวณเพิ่มเติมได้
- ต้องตั้งค่า **Parameter State** ใน General Tab ก่อนถึงจะบันทึกได้

---

## 15. Input Tables

- รองรับการ **write-back** ข้อมูลกลับไปยัง data source
- ให้ผู้ใช้แก้ไขข้อมูลได้โดยตรงใน table

---

## 16. Tooltip, Theme, Appearance

- ปรับแต่ง **Theme** และ **Appearance** ของตารางได้
- กำหนด **Tooltip** สำหรับแต่ละคอลัมน์
- ตั้งค่า **Restrictions** เพื่อควบคุมสิ่งที่ผู้ใช้ทำได้

---

## 17. AI Tab

- มี **AI Tab** สำหรับฟีเจอร์ที่ใช้ AI ช่วยวิเคราะห์ข้อมูล (ใน version 6.1.0)
